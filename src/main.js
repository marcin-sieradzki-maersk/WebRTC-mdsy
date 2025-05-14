import '@maersk-global/fonts/maeu/fonts.css';
import '@maersk-global/mds-foundations/css/foundations.css';
import '@maersk-global/mds-design-tokens/maersk/light/css/design-tokens-px.css';

// Import MDS components
import '@maersk-global/mds-components-core-button';
import '@maersk-global/mds-components-core-icon';
import '@maersk-global/mds-components-core-checkbox';
import '@maersk-global/mds-components-core-card';
import '@maersk-global/mds-components-core-top-bar';

// Set MDS configuration
import { MdsConfig } from '@maersk-global/mds-config';
MdsConfig.iconsDynamicImportPath = import.meta.env.MODE === 'development' ? '/node_modules/' : '/assets/node_modules/';

// Setup MDS components compatibility with WebRTC
document.addEventListener('DOMContentLoaded', function() {
  MdsConfig.iconsDynamicImportPath = import.meta.env.MODE === 'development' ? '/node_modules/' : '/assets/node_modules/';
  // Ensure proper icons in buttons
  ensureProperIcons();
  
  // Setup checkbox event handling
  setupCheckboxes();
  
  // Handle audio settings button click
  setupAudioSettings();
});

function ensureProperIcons() {
  // Ensure Phone icon for the call button
  const callButton = document.getElementById('c2c_call_btn');
  if (callButton) {
    const iconEl = document.createElement('mc-icon');
    iconEl.setAttribute('icon', 'phone');
    iconEl.setAttribute('slot', 'prefix');
    
    // Only add if not already present
    if (!callButton.querySelector('mc-icon[icon="phone"]')) {
      callButton.prepend(iconEl);
    }
  }
}

function setupCheckboxes() {
  // Handle video checkbox changes
  const videoCheckbox = document.getElementById('c2c_video_chk');
  if (videoCheckbox) {
    videoCheckbox.addEventListener('change', function() {
      // Create and dispatch native change event for WebRTC code
      const event = new Event('change', { bubbles: true });
      document.getElementById('c2c_video_chk').dispatchEvent(event);
    });
  }
  
  // Handle self-video checkbox changes
  const selfVideoCheckbox = document.getElementById('c2c_self_video_chk');
  if (selfVideoCheckbox) {
    selfVideoCheckbox.addEventListener('change', function() {
      // Create and dispatch native change event for WebRTC code
      const event = new Event('change', { bubbles: true });
      document.getElementById('c2c_self_video_chk').dispatchEvent(event);
    });
  }
}

function setupAudioSettings() {
  const audioSettingsBtn = document.querySelector('.audio-settings-btn');
  const originalDevicesBtn = document.getElementById('c2c_select_devices_btn');
  
  if (audioSettingsBtn && originalDevicesBtn) {
    audioSettingsBtn.addEventListener('click', function(e) {
      // Trigger the original button's click handler
      originalDevicesBtn.click();
    });
  }
}

// Export for Vite to bundle properly
export default {}; 