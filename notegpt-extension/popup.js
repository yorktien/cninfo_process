async function sendToCurrentTab(type) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  chrome.tabs.sendMessage(tab.id, { type });
}

document.getElementById('capture').addEventListener('click', async () => {
  await sendToCurrentTab('NOTEGPT_CAPTURE_AND_OPEN');
  window.close();
});

document.getElementById('export').addEventListener('click', async () => {
  await sendToCurrentTab('NOTEGPT_EXPORT_PDF');
  window.close();
});
