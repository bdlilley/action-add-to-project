const core = require('@actions/core');
const github = require('@actions/github');
const axios = require("axios")

/************************************************************************************
 * graphql queries
 ************************************************************************************/

// finds issue nodes by organization - this is how the new relase boards are set up
const orgIssueQuery = `
query issues ($after: String!, $projectNumber: Int!) {
  organization(login:"solo-io") {
    id
    projectV2(number: $projectNumber) {
      id
      number
      items(first:100, after:$after, orderBy: {field: POSITION, direction: DESC}) {
        pageInfo {
          endCursor
          startCursor
          hasNextPage
          hasPreviousPage
        }
        
        edges {
          cursor
          node {
            id
            customer:fieldValueByName(name:"Customer") {
              ... on ProjectV2ItemFieldTextValue {
                text
              }
            } 
            notes:fieldValueByName(name:"Notes") {
              ... on ProjectV2ItemFieldTextValue {
                text
              }
            } 
            date:fieldValueByName(name:"Date") {
              ... on ProjectV2ItemFieldDateValue {
                date
              }
            } 
            priority:fieldValueByName(name:"Priority") {
              ... on ProjectV2ItemFieldSingleSelectValue {
                name
              }
            } 
            content {
              ... on Issue {
                id
                number
              }
            }
          }
        }
        totalCount
      }
    }
  }
}`

// finds an issue by repository level GP board
const gpIssueQuery = `
query issues ($after: String!, $projectNumber: Int!) {
  repository(owner: "solo-io", name: "gloo-mesh-enterprise") {
    id
    projectV2(number: $projectNumber) {
      id
      number
      items(first:100, after:$after, orderBy: {field: POSITION, direction: DESC}) {
        pageInfo {
          endCursor
          startCursor
          hasNextPage
          hasPreviousPage
        }
        
        edges {
          cursor
          node {
            id
            customer:fieldValueByName(name:"Customer") {
              ... on ProjectV2ItemFieldTextValue {
                text
              }
            } 
            notes:fieldValueByName(name:"Notes") {
              ... on ProjectV2ItemFieldTextValue {
                text
              }
            } 
            date:fieldValueByName(name:"Date") {
              ... on ProjectV2ItemFieldDateValue {
                date
              }
            } 
            priority:fieldValueByName(name:"Priority") {
              ... on ProjectV2ItemFieldSingleSelectValue {
                name
                optionId
              }
            } 
            content {
              ... on Issue {
                id
                number
              }
            }
          }
        }
        totalCount
      }
    }
  }
}`

// find the destination project board based on a string match of the board name
const getProjectByReleaseQuery = `
query GetProjectByRelease($release: String!) {
  organization(login: "solo-io") {
    projectsV2(first: 100, query: $release) {
      edges {
        node {
          id
          title
          number
          customerField:field(name: "Customer") {
            ... on ProjectV2Field {
              id
              name
            }
          }
          notesField:field(name: "Notes") {
            ... on ProjectV2Field {
              id
              name
            }
          }
          dateField:field(name: "Date") {
            ... on ProjectV2Field {
              id
              name
            }
          }
          priorityField:field(name: "Priority") {
            ... on ProjectV2SingleSelectField {
              id
              name
              options {
                id
                name
              }
            }
          }
        }
      }
    }
  }
}`

// adds the issue by content ID to the desired github project
const addIssueToProjectQuery = `
mutation addIssue($projectId: ID!, $issueId: ID!) {
  addProjectV2ItemById(input: {projectId: $projectId, contentId: $issueId}) {
    clientMutationId
  }
}`

// update the issue project fields in the destination project
const updateIssueFields = `
mutation updateIssue($projectId: ID!, $issueNodeId: ID!, $customerFieldId: ID!, $customerValue: String!, $notesFieldId: ID!, $notesValue: String!, $priorityFieldId: ID!, $priorityOptionId: String!) {
  customer:updateProjectV2ItemFieldValue(
    input: {projectId: $projectId, itemId: $issueNodeId, fieldId: $customerFieldId, value: {text: $customerValue}}
  ) {
    clientMutationId
  }
  notes:updateProjectV2ItemFieldValue(
    input: {projectId: $projectId, itemId: $issueNodeId, fieldId: $notesFieldId, value: {text: $notesValue}}
  ) {
    clientMutationId
  }
  project:updateProjectV2ItemFieldValue(
    input: {projectId: $projectId, itemId: $issueNodeId, fieldId: $priorityFieldId, value: {singleSelectOptionId: $priorityOptionId}}
  ) {
    clientMutationId
  }
}`

// perform an axios request to github api
async function doAxiosRequest(query, vars = {}) {
  return axios({
    url: 'https://api.github.com/graphql',
    method: 'post',
    data: {
      variables: vars,
      query: query
    },
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'token ' + process.env.GITHUB_TOKEN,
    }
  })
}

// update issue fields in destination project
async function updateReleaseIssueFields(input) {
  try {
    const result = await doAxiosRequest(updateIssueFields, input);
  } catch (error) {
    console.error(error);
  }
}

// adds issue to destination project
async function addIssueToProject(projectId, issueId, issueNumber, releaseProject) {
  try {
    const result = await doAxiosRequest(addIssueToProjectQuery, {projectId: projectId, issueId: issueId});
    if (!result?.data?.data?.addProjectV2ItemById) {
      throw new Error(`failed to add issue ${issueNumber} to release board ${releaseProject}`)
    }
  } catch (error) {
    console.error(error);
  }
}

// find the destination project board by release number
async function getProjectByRelease(release) {
  try {
    const result = await doAxiosRequest(getProjectByReleaseQuery, {release:release});
    if (!result?.data?.data?.organization?.projectsV2?.edges) {
      return null 
    }

    const edges = result.data.data.organization.projectsV2.edges
    

    for (let i = 0; i < edges.length; i++) {
      if (edges[i].node.title.toUpperCase().indexOf(`${release} gloo platform`) === -1) { 
        console.log("found the project edge")
        return edges[i]
      }
    }

  } catch (error) {
    console.error(error);
  }
}

// find all the issue nodes in the release project after it has been added
async function findReleaseIssueEdge(projectNumber, issueNumber) {
  let after = ""

  if (!issueNumber) {
    console.log("null issue number")
    return null
  }

  if (!projectNumber) {
    console.log("null project number")
    return null
  }
  
  while (true) {
    try {
      const vars = {after: after, projectNumber: projectNumber}
      console.log(`finding issue number ${issueNumber} in project number ${projectNumber}`)
      // console.log(query)

      const result = await doAxiosRequest(orgIssueQuery, vars);

      if (result?.data?.errors) {
        console.log(JSON.stringify(result.data.errors))
      }

      const edges = result.data.data?.organization?.projectV2?.items?.edges
      if (!edges) {
        console.log("no edges returned")
        break
      }

      for (let i = 0; i < edges.length; i++) {
        if (edges[i].node?.content?.number === issueNumber) {
          console.log("found the issue edge")
          return edges[i]
        }
      }

      const pageInfo = result.data.data?.repository?.projectV2?.items?.pageInfo
      if (!pageInfo) {
        console.log("no pageInfo returned")
        break
      }

      if (!pageInfo.hasNextPage) {
        console.log("end of pages")
        break
      }

      
      after = pageInfo?.endCursor ?? ""
      // console.log("next cursor " + after)
    }
    catch(error) {
      console.error(error);
    }
  } // end while


  return null
}

// find the issue nodes in the GP repo level project
async function findGPIssueEdge(projectNumber, issueNumber) {
  let after = ""

  if (!issueNumber) {
    console.log("null issue number")
    return null
  }

  if (!projectNumber) {
    console.log("null project number")
    return null
  }
  
  while (true) {
    try {
      const vars = {after: after, projectNumber: projectNumber}
      console.log(`finding issue number ${issueNumber} in project number ${projectNumber}`)
      const result = await doAxiosRequest(gpIssueQuery, vars);

      if (result?.data?.errors) {
        console.log(JSON.stringify(result.data.errors))
      }

      const edges = result.data.data?.repository?.projectV2?.items?.edges
      if (!edges) {
        console.log("no edges returned")
        break
      }

      for (let i = 0; i < edges.length; i++) {
        if (edges[i].node?.content?.number === issueNumber) {
          console.log("found the issue edge")
          return edges[i]
        }
      }

      const pageInfo = result.data.data?.repository?.projectV2?.items?.pageInfo
      if (!pageInfo) {
        console.log("no pageInfo returned")
        break
      }

      if (!pageInfo.hasNextPage) {
        console.log("end of pages")
        break
      }

      
      after = pageInfo?.endCursor ?? ""
    }
    catch(error) {
      console.error(error);
    }
  } // end while


  return null
}

// main handler for github custom action
(async () => {
try {
  const release = core.getInput('release') || "2.4";
  const issueId = Number(core.getInput('issue') || "9198");

  // find the destination project
  const proj = await getProjectByRelease(release)
  if (!proj) {
    throw new Error(`project board not found for release ${release}`);
  }
  console.log(proj)

  // find the issue in the GP project
  const issue = await findGPIssueEdge(23, issueId);
  if (!issue) {
    throw new Error(`issue ${issueId} not found`);
  }
  console.log(issue)

  // add the issue to the destination project - use the "content" id and not the node id here
  await addIssueToProject(proj.node.id, issue.node.content.id, issueId, proj.node.title)

  // find the issue in the destination release project
  const releaseIssue = await findReleaseIssueEdge(proj.node.number, issueId);
  if (!releaseIssue) {
    throw new Error(`issue ${issueId} not found in release board ${proj.node.title}`);
  }
  console.log(releaseIssue)



  // update the fields on the destination project
  console.log("updating target project fields")

  // have to find the right options Id on destination project by value before we can update it
  let optionId
  for (let index = 0; index < proj.node.priorityField.options.length; index++) {
    const element = proj.node.priorityField.options[index];
    if (element.name.toUpperCase() === issue.node.priority?.name?.toUpperCase()) {
      optionId = element.id
    }
  }

  await updateReleaseIssueFields({
    issueNumber: issueId,
    releaseProject: proj.node.title,
    projectId: proj.node.id,
    issueNodeId: releaseIssue.node.id,
    customerFieldId: proj.node.customerField.id,
    customerValue: issue.node.customer?.text || "",
    priorityFieldId: proj.node.priorityField.id,
    priorityOptionId: optionId || "",
    // dateFieldId: "?",
    // dateValue: issue.node.priority?.date || "",
    notesFieldId:  proj.node.notesField.id,
    notesValue: issue.node.notes?.text || "",
  });

} catch (error) {
  core.setFailed(error.message);
}
})();
