const core = require('@actions/core');
const github = require('@actions/github');
const { Octokit } = require("@octokit/rest");

try {
  const octokit = new Octokit({
    auth: core.getInput('token')
  });
  const projectId = core.getInput('project');
  const issueId = core.getInput('issue');
  console.log(`add ${issueId} to ${projectId}`);

  octokit.projects
    .listForOrg({org: "solo-io", type: "private"})
    .then(({ data }) => {
      console.log(JSON.stringify(data))
    });

//   const time = (new Date()).toTimeString();
//   core.setOutput("time", time);
  // Get the JSON webhook payload for the event that triggered the workflow
  // const payload = JSON.stringify(github.context.payload, undefined, 2)
  // console.log(`The event payload: ${payload}`);
} catch (error) {
  core.setFailed(error.message);
}