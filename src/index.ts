import Axios from 'axios';

const SECOND = 1000;

async function main() {
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  if (!GITHUB_TOKEN) {
    throw new Error('`GITHUB_TOKEN` env var must be defined')
  }
  
  const PR_NUMBER = Number.parseInt(String(process.env.PR), 10);
  if (!isFinite(PR_NUMBER)) {
    throw new Error('`PR` env var must be defined');
  }

  const x = Axios.create({
    baseURL: 'https://api.github.com/repos/elastic/kibana',
    headers: {
      'user-agent': '@spalger/pr-retester',
      'authorization': `token ${GITHUB_TOKEN}`
    }
  })

  async function waitForSuccess(headCommit: string) {
    process.stdout.write(`waiting for commit ${headCommit} to succeed`);

    while (true) {
      const status = await x.get(`commits/${headCommit}/status`);
  
      switch (status.data.state) {
        case 'pending':
          process.stdout.write('.')
          break;
        case 'success':
          process.stdout.write(' ✅\n');
          return;
        default:
          process.stdout.write('?');
          break;
      }
  
      // wait for 60 seconds
      await new Promise(resolve => setTimeout(resolve, 60*SECOND));
    }
  }
  
  async function retest(oldCommit: string) {
    console.log('sending comment to trigger new commit');
    await x.post(`issues/${PR_NUMBER}/comments`, {
      body: '@elasticmachine merge upstream'
    });
    
    process.stdout.write(`waiting for new commit to show up`);
    await new Promise(resolve => setTimeout(resolve, 60*SECOND));
    while (true) {
      const pr = await x.get(`pulls/${PR_NUMBER}`);
      if (pr.data.head.sha !== oldCommit) {
        process.stdout.write(' ✅\n');
        return pr.data.head.sha
      }
    }
  }

  let oldCommit = (await x.get(`pulls/${PR_NUMBER}`)).data.head.sha
  await waitForSuccess(oldCommit);
  while (true) {
    const newCommit = await retest(oldCommit);
    await waitForSuccess(newCommit);
    oldCommit = newCommit;
  }
}  

main().catch(error => {
  console.error('FATAL ERROR');
  console.error(error.stack);
  process.exit(1)
})
