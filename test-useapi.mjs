const token = "user:2747-bBathp37u5HUApvCbPwAm";
const email = "australwhisks@gmail.com";

async function checkJobs() {
    console.log("Checking UseAPI jobs details...");
    try {
        const response = await fetch(`https://api.useapi.net/v1/google-flow/jobs?email=${email}`, {
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        if (Array.isArray(data)) {
            console.log("Total jobs found:", data.length);
            const lastJob = data[0]; // Assuming newest is first
            console.log("Last job:", JSON.stringify(lastJob, null, 2));
        } else {
            console.log("Response data:", JSON.stringify(data, null, 2));
        }
    } catch (error) {
        console.error("Fetch failed:", error);
    }
}

checkJobs();
