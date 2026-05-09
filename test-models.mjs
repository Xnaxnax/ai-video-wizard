const token = "user:2747-bBathp37u5HUApvCbPwAm";
const email = "ialexei41@gmail.com";

async function checkModels() {
    console.log("Checking UseAPI models...");
    try {
        const response = await fetch(`https://api.useapi.net/v1/google-flow/models`, {
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        console.log("Models:", JSON.stringify(data, null, 2));
    } catch (error) {
        console.error("Fetch failed:", error);
    }
}

checkModels();
