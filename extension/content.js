// File: extension/content.js

// This function finds the send button in a Gmail compose window
const findSendButton = (composeView) => {
  // Try multiple selectors for better compatibility
  return composeView.querySelector('div[role="button"][data-tooltip*="Send"]') ||
         composeView.querySelector('div[role="button"][aria-label*="Send"]') ||
         composeView.querySelector('div[role="button"].T-I.J-J5-Ji.aoO.v7.T-I-atl.L3');
};

// Helper function to get recipient email
const getRecipient = (composeView) => {
  // Try multiple methods to get recipient
  const toField = composeView.querySelector('input[name="to"]');
  if (toField && toField.value) return toField.value;
  
  // Check for email spans (when email is already entered)
  const emailSpans = composeView.querySelectorAll('span[email]');
  if (emailSpans.length > 0) {
    return Array.from(emailSpans).map(span => span.getAttribute('email')).join(', ');
  }
  
  // Check for data-hovercard-id (another Gmail method)
  const hovercards = composeView.querySelectorAll('[data-hovercard-id]');
  if (hovercards.length > 0) {
    return Array.from(hovercards).map(el => el.getAttribute('data-hovercard-id')).join(', ');
  }
  
  // Last resort: check the visible text in the To field
  const toContainer = composeView.querySelector('div[aria-label="To"]') || 
                      composeView.querySelector('.agP.aFw');
  if (toContainer) {
    return toContainer.innerText.trim();
  }
  
  return 'unknown@recipient.com';
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
  trackButton.style.cssText = 'cursor: pointer; background: #4285F4; color: white; padding: 0 12px; margin-right: 8px; border-radius: 4px; display: flex; align-items: center; height: 32px; font-size: 14px;';
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
  
  // Create named function to avoid arguments.callee issue
  const handleSendClick = async function(e) {
    // Check if tracking is enabled
    if (trackButton.getAttribute('data-tracking-enabled') !== 'true') {
        console.log('Tracking is disabled. Sending normally.');
        return;
    }
    
    // PREVENT the email from sending immediately
    e.stopPropagation();
    e.preventDefault();
    
    console.log('Send button clicked, injecting tracking pixel...');
    
    // 1. Get email data from the compose window
    const recipient = getRecipient(composeView);
    
    const subjectField = composeView.querySelector('input[name="subjectbox"]') ||
                        composeView.querySelector('[name="subjectbox"]');
    
    const bodyDiv = composeView.querySelector('div[aria-label="Message Body"]') ||
                   composeView.querySelector('div[contenteditable="true"][role="textbox"]') ||
                   composeView.querySelector('.Am.Al.editable');
    
    const subject = subjectField ? subjectField.value : '(No Subject)';
    
    console.log('Email details:', { recipient, subject, bodyFound: !!bodyDiv });
    
    if (!bodyDiv) {
      console.error('Could not find email body!');
      // Send anyway if we can't find the body
      sendButton.removeEventListener('click', handleSendClick, true);
      sendButton.click();
      return;
    }
    
    try {
      // 2. Call the backend to get the tracking pixel
      const response = await fetch('https://email-tracker-brown.vercel.app/api/v1/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'test-user-123',
          recipient: recipient,
          subject: subject
        })
      });
      
      const data = await response.json();
      
      // 3. Inject the pixel into the email body
      if (data.pixelHtml) {
        console.log('Injecting tracking pixel:', data.pixelHtml);
        bodyDiv.innerHTML += data.pixelHtml;
        
        // Wait a moment for the DOM to update
        await new Promise(resolve => setTimeout(resolve, 100));
        
        console.log('Pixel injected successfully. Now sending email...');
      }
      
    } catch (error) {
      console.error('Error from tracking server:', error);
    }
    
    // 4. NOW trigger the actual send
    // Remove our listener to avoid infinite loop
    sendButton.removeEventListener('click', handleSendClick, true);
    
    // Trigger the click
    sendButton.click();
  };
  
  // Add the event listener with capture phase
  sendButton.addEventListener('click', handleSendClick, true);
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

console.log('Email Tracker extension loaded!');