// Create context-menu entry on install/update
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "quickburn",
    title: "Send with Quickburn",
    contexts: ["selection"] // only when text is selected
  });
});

// When user clicks the menu, stash the selected text & open the popup
chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== "quickburn") return;
  await chrome.storage.session.set({ qb_text: info.selectionText || "" });
  chrome.action.openPopup();
});
