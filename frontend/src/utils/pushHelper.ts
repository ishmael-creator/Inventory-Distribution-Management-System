// Helper function to convert your VAPID string key into a format the browser requires
function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function subscribeToPushNotifications(token: string) {
  // 1. Check if the browser even supports push notifications
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('Push notifications are not supported by this browser.');
    return;
  }

  try {
    // 2. Register the sw.js background file
    const registration = await navigator.serviceWorker.register('/sw.js');
    
    // 3. Request permission from the user (Triggers the browser pop-up)
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.warn('User denied push notification permissions.');
      return;
    }

    // 4. Grab your public VAPID key from the .env.local file
    const publicVapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!publicVapidKey) {
      console.error('Missing NEXT_PUBLIC_VAPID_PUBLIC_KEY in frontend env.');
      return;
    }

    // 5. Ask the browser (Chrome/Safari) to generate a unique device token
    const convertedVapidKey = urlBase64ToUint8Array(publicVapidKey);
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: convertedVapidKey
    });

    // 6. Send this payload down to your new FastAPI endpoint
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/notifications/push-subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}` 
      },
      body: JSON.stringify(subscription)
    });

    if (response.ok) {
      console.log('✅ Device successfully linked to backend for Push Alerts!');
    } else {
      console.error('❌ Failed to save subscription on backend.');
    }

  } catch (error) {
    console.error('Error setting up Web Push subscription:', error);
  }
}