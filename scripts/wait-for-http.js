const url = process.argv[2];
const attempts = Number(process.argv[3] || 24);
const delayMs = Number(process.argv[4] || 5000);
const expectedRevision = process.argv[5] || "";

if (!url || !/^https?:\/\//.test(url) || url.includes("@")) {
  console.error("Pass an http(s) URL with no userinfo.");
  process.exit(1);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  let lastStatus = 0;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      lastStatus = response.status;
      const text = await response.text();
      if (response.ok) {
        try {
          const body = JSON.parse(text);
          if (body.status === "ok" || body.status === "ready") {
            if (expectedRevision && body.revision !== expectedRevision) {
              console.log(`Service is up on a different revision (${attempt}/${attempts}).`);
            } else {
              console.log(`Ready after ${attempt} attempt(s) with status ${response.status}.`);
              return;
            }
          }
        } catch {
          lastStatus = response.status;
        }
      }
    } catch {
      lastStatus = 0;
    }
    console.log(`Waiting for the service (${attempt}/${attempts}), last status ${lastStatus}.`);
    await sleep(delayMs);
  }
  console.error("The service did not become ready in time.");
  process.exit(1);
}

main();
