// src/app/api/notify-admin/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { sendEmailToAdmin } from '@/lib/email-service'; 

interface NotifyAdminBody {
  subject?: string;
  message?: string;
  html?: boolean;
}

export async function POST(req: NextRequest) {
  try {
    let body: NotifyAdminBody | null = null;
    try {
      body = await req.json();
    } catch {
      // No body provided or invalid JSON; proceed to default behavior
    }
    console.log("Notify admin called with body:", body);
    // Extract the client's IP from headers (handles proxies like Vercel or Cloudflare)
      const xForwardedFor = req.headers.get('x-forwarded-for');
      const clientIp = xForwardedFor
        ? xForwardedFor.split(',')[0].trim()  // Take the first IP in the chain (client's original IP)
        : req.headers.get('x-real-ip') || 'Unknown';  // Fallback for direct or other headers
    if (body && body.subject && body.message) {
      // Use provided subject and message for custom notification
      console.log('Sending custom admin notification with subject:', body.subject);
      const htmlMode = body.html === true;
      const decoratedMessage = htmlMode
        ? `${body.message}<p><strong>Client IP:</strong> ${clientIp}</p>`
        : `${body.message}\n Client IP: ${clientIp}`;
      await sendEmailToAdmin(body.subject, decoratedMessage, htmlMode);
    } else {
      console.log('Sending default admin notification for registration form opened');
      // Default behavior: Notification for registration form opened
      
      console.log("Client IP detected as:", clientIp);
      if (!clientIp.startsWith('66.249.')) { // Ignore Googlebot IPs      
        // Send the email with the IP included
        await sendEmailToAdmin(
          'Registration Form Opened',
          `A user has opened the registration form. \n ${new Date().toISOString()}\n Client IP: ${clientIp}`,
          false
        );    
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Server error sending admin notification:', error);
    return NextResponse.json({ success: false, error: 'Failed to send notification' }, { status: 500 });
  }
}
