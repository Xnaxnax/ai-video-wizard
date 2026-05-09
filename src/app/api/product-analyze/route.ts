/**
 * POST /api/product-analyze
 * Analyzes a product image and returns a full ProductProfile (physical + semantic).
 * Called from Step1Script immediately when user uploads a product image.
 */
import { NextRequest, NextResponse } from "next/server";
import { analyzeProductImage, getFallbackProductProfile } from "@/core/product-analyzer";

export async function POST(request: NextRequest) {
  try {
    const { imageUrl } = await request.json();

    if (!imageUrl) {
      return NextResponse.json({ error: "Missing imageUrl" }, { status: 400 });
    }

    const profile = await analyzeProductImage(imageUrl);

    if (!profile) {
      console.warn("[/api/product-analyze] Analysis failed, returning fallback");
      return NextResponse.json(getFallbackProductProfile());
    }

    console.log(
      `[/api/product-analyze] Done: ${profile.product_type} | ${profile.semantic.product_category} → ${profile.semantic.application_target}`
    );

    return NextResponse.json(profile);
  } catch (error: any) {
    console.error("[/api/product-analyze] Error:", error.message);
    return NextResponse.json({ error: "Analysis failed", details: error.message }, { status: 500 });
  }
}
