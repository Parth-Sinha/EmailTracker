// File: extension/content.js

// This function finds the send button in a Gmail compose window
const findSendButton = (composeView) => {
  // Gmail's class names can be obscure and change. This is an example selector.
  // You may need to inspect the Gmail UI to find the correct, stable selector.
  return composeView.querySelector('div[role="button"][data-tooltip*="Send"]');
};

// This function is the core logic
const setupTracking = (composeView) => {
  // Prevent adding multiple buttons to the same compose view
  if (composeView.querySelector('.tracking-btn')) {
    return;
  }

  const sendButton = findSendButton(composeView);
  if (!sendButton) return;

  // Create our "Track" button
  const trackButton = document.createElement('div');
  trackButton.innerText = 'Track 📧';
  trackButton.className = 'tracking-btn';
  trackButton.style.cssText = 'cursor: pointer; background: #4285F4; color: white; padding: 0 12px; margin-right: 8px; border-radius: 4px; display: flex; align-items: center;';
  trackButton.setAttribute('data-tracking-enabled', 'true'); // Default to on

  trackButton.onclick = () => {
    const isEnabled = trackButton.getAttribute('data-tracking-enabled') === 'true';
    if (isEnabled) {
      trackButton.setAttribute('data-tracking-enabled', 'false');
      trackButton.style.background = '#777';
      trackButton.innerText = 'Track ❌';
    } else {
      trackButton.setAttribute('data-tracking-enabled', 'true');
      trackButton.style.background = '#4285F4';
      trackButton.innerText = 'Track 📧';
    }
  };
  
  // Insert our button before the Send button
  sendButton.parentNode.insertBefore(trackButton, sendButton);
  
  // Listen for a click on the REAL send button
  sendButton.addEventListener('mousedown', (e) => {
    // Check if tracking is enabled
    if (trackButton.getAttribute('data-tracking-enabled') !== 'true') {
        console.log('Tracking is disabled. Sending normally.');
        return;
    }
    
    // 1. Get email data from the compose window
    const recipientField = composeView.querySelector('input[name="to"]');
    const subjectField = composeView.querySelector('input[name="subjectbox"]');
    const bodyDiv = composeView.querySelector('div[aria-label="Message Body"]');
    
    const recipient = recipientField ? recipientField.value : '';
    const subject = subjectField ? subjectField.value : '';
    
    // 2. Call the backend to get the tracking pixel
    fetch('http://localhost:3000/api/v1/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // In a real app, you would get the userId after login
        userId: 'test-user-123',
        recipient: recipient,
        subject: subject
      })
    })
    .then(response => response.json())
    .then(data => {
      // 3. Inject the pixel into the email body
      if (bodyDiv && data.pixelHtml) {
        console.log('Injecting tracking pixel...');
        bodyDiv.innerHTML += data.pixelHtml;
      }
    })
    .catch(error => console.error('Error from tracking server:', error));
    
  }, true); // Use capture phase to run before Gmail's own handlers
};


// Gmail's UI is dynamic, so we need to constantly check for new compose windows
setInterval(() => {
  // Find all compose windows on the page
  const composeViews = document.querySelectorAll('div[role="dialog"]');
  composeViews.forEach(view => {
    // Check if it's a valid compose window that we haven't processed yet
    if (findSendButton(view)) {
      setupTracking(view);
    }
  });
}, 1000); // Check every second