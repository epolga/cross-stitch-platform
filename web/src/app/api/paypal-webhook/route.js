import axios from 'axios';
import {
  getSubscriptionUserSnapshotBySubscriptionId,
  setSubscriptionActiveBySubscriptionId,
} from '@/lib/users';
import {
  recordSubscriptionEvent,
  toRecordedSubscriptionStatus,
} from '@/lib/subscription-events';

export async function POST(req) {
  try {
    const skipSignatureVerification =
      process.env.PAYPAL_WEBHOOK_SKIP_SIGNATURE_VERIFICATION === 'true';

    // Parse the incoming webhook request body
    const body = await req.json();

    // Extract PayPal-specific headers for signature verification
    const headers = req.headers;
    const transmissionId = headers.get('PayPal-Transmission-Id');
    const transmissionTime = headers.get('PayPal-Transmission-Time');
    const certUrl = headers.get('PayPal-Cert-Url');
    const authAlgo = headers.get('PayPal-Auth-Algo');
    const transmissionSig = headers.get('PayPal-Transmission-Sig');
    const webhookId = process.env.PAYPAL_WEBHOOK_ID;

    console.log('Received PayPal webhook:', body);
    // Detect if this is a simulated event based on user-agent
    const isSimulated = headers.get('user-agent') === 'PayPal/AUHD-1.0-1';

    console.log('isSimulated:', isSimulated);
    // Validate environment variables (unless verification is intentionally bypassed)
    if (
      !skipSignatureVerification &&
      (!webhookId || !process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET)
    ) {
      console.error('Missing required environment variables: PAYPAL_WEBHOOK_ID, PAYPAL_CLIENT_ID, or PAYPAL_CLIENT_SECRET');
      return new Response(JSON.stringify({ error: 'Server configuration error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const protocol = headers.get('x-forwarded-proto') || 'https';
    const host = headers.get('host');
    const baseUrl = `${protocol}://${host}`;

    const notifyAdmin = async (subject, message) => {
      try {
        const response = await fetch(`${baseUrl}/api/notify-admin`, { 
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subject: subject, message: message })
        });
        if (response.ok) {
          console.log('Admin notified of webhook received.');
        } else {
          throw new Error(`API response not OK: ${response.status}`);
        }
      } catch (error) {
        console.error('Failed to send email notification to admin:', error);
      }
    };
    const eventType = body.event_type;
    const now = new Date();
    const timeString = now.toTimeString().substring(0, 8);
    const bodyMessage =
    `Received PayPal webhook event: ${eventType}\n${JSON.stringify(body, null, 2)}\nHeaders: ${JSON.stringify(Object.fromEntries(headers), null, 2)} \nSimulated: ${isSimulated} Time: ${timeString}`;
    await notifyAdmin('Webhook received', bodyMessage);

    let verifyResponse;
    if (!isSimulated && !skipSignatureVerification) {
      // Obtain PayPal access token (production endpoint)
      const authResponse = await axios.post(
        'https://api-m.paypal.com/v1/oauth2/token',
        'grant_type=client_credentials',
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${Buffer.from(
              `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
            ).toString('base64')}`,
          },
        }
      );

      const accessToken = authResponse.data.access_token;
      if (!accessToken) {
        console.error('Failed to obtain PayPal access token');
        return new Response(JSON.stringify({ error: 'Authentication failed' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      console.log('All request headers:', Object.fromEntries(headers));
      console.log('PayPal access token obtained successfully');
      console.log('certUrl:', certUrl);
      
      // Verify webhook signature (production endpoint)
      const verifyUrl = 'https://api-m.paypal.com/v1/notifications/verify-webhook-signature';
      const verifyPayload = {
        auth_algo: authAlgo,
        cert_url: certUrl,
        transmission_id: transmissionId,
        transmission_sig: transmissionSig,
        transmission_time: transmissionTime,
        webhook_id: webhookId,
        webhook_event: body,
      };

      verifyResponse = await axios.post(verifyUrl, verifyPayload, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (verifyResponse.status !== 200) {
        console.error('Webhook verification API call failed with status:', verifyResponse.status);
        await notifyAdmin('Webhook error notification', `Webhook verification API call failed with status: ${verifyResponse.status}`);
        return new Response(JSON.stringify({ error: 'Webhook verification failed' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (verifyResponse.data.verification_status !== 'SUCCESS') {
        console.log('verifyResponse.data:', verifyResponse.data);
        console.error('Webhook signature verification failed:', verifyResponse.data);
        await notifyAdmin('Webhook error notification', `Webhook signature verification failed: ${JSON.stringify(verifyResponse.data)}`);
        return new Response(JSON.stringify({ error: 'Invalid webhook signature' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    } else if (skipSignatureVerification) {
      console.warn('PAYPAL_WEBHOOK_SKIP_SIGNATURE_VERIFICATION=true; signature verification is bypassed.');
      await notifyAdmin(
        'Webhook signature verification bypassed',
        `Event ${body?.event_type || 'UNKNOWN'} accepted without PayPal signature verification.`,
      );
    } else {
      console.log('Simulated event detected, skipping signature verification.');
      await notifyAdmin('Simulated Webhook Received', 'A simulated PayPal webhook event has been received for testing purposes.');
    }

    console.log(`Received PayPal webhook event: ${eventType}`, body);

    const subscriptionId = body?.resource?.id;
    if (typeof subscriptionId === 'string' && subscriptionId.trim().length > 0) {
      let shouldActivate = null;
      if (eventType === 'BILLING.SUBSCRIPTION.ACTIVATED' || eventType === 'BILLING.SUBSCRIPTION.RE-ACTIVATED') {
        shouldActivate = true;
      } else if (
        eventType === 'BILLING.SUBSCRIPTION.CANCELLED' ||
        eventType === 'BILLING.SUBSCRIPTION.SUSPENDED' ||
        eventType === 'BILLING.SUBSCRIPTION.EXPIRED'
      ) {
        shouldActivate = false;
      }

      if (shouldActivate !== null) {
        const beforeSnapshot =
          await getSubscriptionUserSnapshotBySubscriptionId(subscriptionId);
        const previousStatus = toRecordedSubscriptionStatus(beforeSnapshot);

        const updated = await setSubscriptionActiveBySubscriptionId(subscriptionId, shouldActivate);
        console.log(
          `[paypal-webhook] Updated subscription state for ${subscriptionId}: ${updated}, active=${shouldActivate}`,
        );

        const afterSnapshot =
          await getSubscriptionUserSnapshotBySubscriptionId(subscriptionId);
        const currentStatus = toRecordedSubscriptionStatus(afterSnapshot);
        const statusChanged = previousStatus !== currentStatus;

        await recordSubscriptionEvent({
          source: 'PAYPAL_WEBHOOK',
          eventType,
          status: currentStatus,
          previousStatus,
          subscriptionId,
          userId: afterSnapshot?.userId || beforeSnapshot?.userId,
          email: afterSnapshot?.email || beforeSnapshot?.email,
          trialStartedAt:
            afterSnapshot?.trialStartedAt || beforeSnapshot?.trialStartedAt,
          paypalEventId: typeof body?.id === 'string' ? body.id : undefined,
          rawStatus:
            typeof body?.resource?.status === 'string'
              ? body.resource.status
              : undefined,
          notes: `simulated=${isSimulated}; userUpdated=${updated}; shouldActivate=${shouldActivate}`,
        });

        if (statusChanged) {
          const statusMessage = [
            'Subscription status changed from PayPal webhook.',
            `Event: ${eventType}`,
            `Subscription ID: ${subscriptionId}`,
            `User ID: ${afterSnapshot?.userId || beforeSnapshot?.userId || 'Unknown'}`,
            `Email: ${afterSnapshot?.email || beforeSnapshot?.email || 'Unknown'}`,
            `Previous status: ${previousStatus}`,
            `Current status: ${currentStatus}`,
            `Trial start date: ${afterSnapshot?.trialStartedAt || beforeSnapshot?.trialStartedAt || 'Not started'}`,
            `Updated local record: ${updated}`,
            `Simulated: ${isSimulated}`,
          ].join('\n');
          await notifyAdmin('Subscription status changed', statusMessage);
        }
      }
    }
    // Process the webhook event
/*
    // Handle specific event types
    if (eventType === 'PAYMENT.CAPTURE.COMPLETED') {
      const paymentId = body.resource.id;
      const amount = body.resource.amount.value;
      console.log(`Payment completed: ID=${paymentId}, Amount=${amount}`);
      // Add your business logic here (e.g., update database, send confirmation)
    } else if (eventType === 'CHECKOUT.ORDER.APPROVED') {
      const orderId = body.resource.id;
      console.log(`Order approved: ID=${orderId}`);
      // Add your business logic here
    }
*/
    // Respond with 2xx status to acknowledge receipt
    return new Response(JSON.stringify({ status: 'success' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error processing webhook:', error.message);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
