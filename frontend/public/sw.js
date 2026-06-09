// Listen for the push event from the backend
self.addEventListener('push', function (event) {
  if (!event.data) return;

  // Parse the incoming data sent from FastAPI
  const data = event.data.json();
  
  const options = {
    body: data.body || 'You have a new update.',
    icon: '/icon.png', // Path to your app icon in the public folder
    badge: '/badge.png', // Small icon for phone status bars
    vibrate: [100, 50, 100], // Vibration pattern for Android phones
    data: {
      url: data.url || '/dashboard/distribution/dispatches' // Where to redirect when clicked
    }
  };

  // Tell the OS to display the notification popup
  event.waitUntil(
    self.registration.showNotification(data.title || 'Inventory Alert', options)
  );
});

// Look at what happens when a user clicks the notification popup
self.addEventListener('notificationclick', function (event) {
  event.notification.close(); // Close the popup immediately

  // Open the dashboard page automatically
  event.waitUntil(
    clients.openWindow(event.notification.data.url)
  );
});