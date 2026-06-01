import { NextResponse } from "next/server";
//import '@/lib/error-logger'; 

export async function GET() {
    return NextResponse.json({ status: "OK" });
}