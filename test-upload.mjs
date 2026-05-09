import Buffer from 'node:buffer';

const token = "user:2747-bBathp37u5HUApvCbPwAm";
const email = "australwhisks@gmail.com";

async function testUpload() {
    console.log("Testing uploadAsset directly...");
    // Minimal valid PNG (1x1 transparent)
    const base64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const buffer = Buffer.Buffer.from(base64, 'base64');

    try {
        const response = await fetch(`https://api.useapi.net/v1/google-flow/assets/${email}`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "image/png",
            },
            body: buffer,
        });

        console.log("Status:", response.status);
        const data = await response.json();
        console.log("Data:", JSON.stringify(data, null, 2));
    } catch (error) {
        console.error("Upload failed:", error);
    }
}

testUpload();
