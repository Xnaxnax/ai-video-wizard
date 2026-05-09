const token = "user:2747-bBathp37u5HUApvCbPwAm";
const email = "ialexei41@gmail.com";

async function testAnimation() {
    console.log("Testing UseAPI Animation...");
    const testImageUrl = "https://images.openai.com/blob/574f89d3-356a-4b9e-9909-58d34190c765/stablediffusion.png"; // Just a test image
    
    try {
        // 1. Upload asset
        console.log("Uploading asset...");
        const assetRes = await fetch(`https://api.useapi.net/v1/google-flow/assets/${email}`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ url: testImageUrl })
        });
        const assetData = await assetRes.json();
        console.log("Asset response:", assetData);
        
        if (!assetData.assetId) {
            console.error("No assetId returned");
            return;
        }

        // 2. Create video
        console.log("Creating video...");
        const videoRes = await fetch(`https://api.useapi.net/v1/google-flow/videos`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                email: email,
                prompt: "Man smiling and nodding. Cinematic lighting.",
                referenceImage: assetData.assetId,
                voice: "zephyr",
                model: "Veo 3.1 Fast",
                duration: 8
            })
        });
        
        const videoData = await videoRes.json();
        console.log("Video response:", videoData);
    } catch (error) {
        console.error("Test failed:", error);
    }
}

testAnimation();
