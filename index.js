const core = require('@actions/core');
const github = require('@actions/github');

try {
  const projectId = core.getInput('project');
  const issueId = core.getInput('issue');
  console.log(`add ${issueId} to ${projectId}`);

//   const time = (new Date()).toTimeString();
//   core.setOutput("time", time);
  // Get the JSON webhook payload for the event that triggered the workflow
  const payload = JSON.stringify(github.context.payload, undefined, 2)
  console.log(`The event payload: ${payload}`);
} catch (error) {
  core.setFailed(error.message);
}