import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), "MissingDesignPdfs.txt");
    const content = await fs.readFile(filePath, "utf-8");
    return new NextResponse(content, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (error) {
    console.error("[missing-design-pdfs] failed to read file", error);
    return NextResponse.json(
      { error: "MissingDesignPdfs.txt not found" },
      { status: 404 },
    );
  }
}
