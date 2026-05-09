import fs from 'fs';

const token = process.env.USEAPI_TOKEN || "user:2747-bBathp37u5HUApvCbPwAm";
const email = process.env.USEAPI_EMAIL || "australwhisks@gmail.com";
const baseUrl = "https://api.useapi.net/v1/google-flow";

async function uploadAsset(imageUrl) {
    console.log(`[UseApi] Downloading image from: ${imageUrl}`);
    const imgResponse = await fetch(imageUrl);
    if (!imgResponse.ok) {
        throw new Error(`Failed to download image for upload: ${imgResponse.statusText}`);
    }
    const contentType = imgResponse.headers.get("content-type") || "image/jpeg";
    const imageBuffer = await imgResponse.arrayBuffer();

    console.log(`[UseApi] Uploading image buffer to assets for ${email}...`);
    const response = await fetch(`${baseUrl}/assets/${email}`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": contentType,
        },
        body: imageBuffer,
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Asset upload failed: ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();
    console.log(`[UseApi] Asset upload response:`, JSON.stringify(data));
    const id = data?.mediaGenerationId?.mediaGenerationId || data?.media?.name;
    if (!id) {
        throw new Error(`Asset upload did not return assetId. Response: ${JSON.stringify(data)}`);
    }

    console.log(`[UseApi] Asset ID extracted: ${id}`);
    return id;
}

async function runTest() {
    const sceneStr = fs.readFileSync('debug-scene.json', 'utf8');
    const scene = JSON.parse(sceneStr);
    console.log(`Starting debug for scene: ${scene.id}`);
    
    try {
        const assetId = await uploadAsset(scene.imageUrl);
        console.log(`[UseApi] Asset uploaded, ID: ${assetId}`);
        
        console.log(`[UseApi] Creating video job...`);
        const response = await fetch(`${baseUrl}/videos`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                email: email,
                prompt: scene.animationPrompt,
                startImage: assetId,
                model: "veo-3.1-lite",
                async: true,
            }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error(`[UseApi] Videos error response:`, JSON.stringify(errorData));
            throw new Error(`UseApi API error: ${JSON.stringify(errorData)}`);
        }

        const jobData = await response.json();
        console.log(`[UseApi] Videos response:`, JSON.stringify(jobData));
        const jobId = jobData.jobid || jobData.jobId || jobData.job_id || jobData.id;

        if (!jobId) {
            throw new Error(`UseApi failed to return jobid. Response: ${JSON.stringify(jobData)}`);
        }

        console.log(`[UseApi] Job created successfully: ${jobId}`);
    } catch (err) {
        console.error("Test failed with error:", err.message);
    }
}

runTest();
