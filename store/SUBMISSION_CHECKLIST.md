# Chrome Web Store Submission Checklist

## Prerequisites

- [ ] Google Developer account ($5 one-time fee)
      → https://chrome.google.com/webstore/devconsole/register

## Before Submission

### 1. Test the Extension
- [ ] Test all features work correctly
- [ ] Test on different Chrome versions if possible
- [ ] Test light and dark mode
- [ ] Check console for errors

### 2. Prepare Package
```bash
npm run package
```
This creates `package/tabfocus-v1.0.0.zip`

### 3. Prepare Screenshots (Required)
You need 1-5 screenshots (1280x800 or 640x400 PNG/JPEG)

**Recommended screenshots:**
1. Main popup showing tab groups
2. Search feature in action
3. Create new group modal
4. Sessions feature
5. Settings page

**How to capture:**
- Open the extension popup
- Use Chrome DevTools (F12) → Device toolbar → Set dimensions
- Or use a screenshot tool

Save screenshots to `store/screenshots/` folder.

### 4. Prepare Store Assets
```bash
npm run store:assets
```

**Required:**
- [ ] Small promo tile: 440x280 PNG → `store/promo-small.png` ✓

**Optional but recommended:**
- [ ] Marquee promo: 1400x560 PNG → `store/promo-marquee.png` ✓

### 5. Host Privacy Policy
The privacy policy must be hosted at a public URL.

**Options:**
- GitHub Gist (free): Create gist from `store/PRIVACY_POLICY.md`
- GitHub Pages: Add to your repo's docs
- Your own website

## Submission Steps

1. Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)

2. Click "New Item" → Upload `package/tabfocus-v1.0.0.zip`

3. Fill in Store Listing:
   - **Language:** English
   - **Title:** TabFocus
   - **Summary:** (from STORE_LISTING.md - 132 char limit)
   - **Description:** (from STORE_LISTING.md)
   - **Category:** Productivity
   - **Icon:** Already in package (128x128)
   - **Screenshots:** Upload your screenshots
   - **Promo tiles:** Upload from store/ folder

4. Fill in Privacy:
   - **Single purpose:** "Manage and organize browser tabs with focus mode"
   - **Permission justification:**
     - tabs: "Read tab titles and URLs to display in the extension"
     - tabGroups: "Create and manage Chrome tab groups"
     - storage: "Save user settings and sessions locally"
     - alarms: "Check for idle tabs to suspend"
     - contextMenus: "Add right-click menu options"
   - **Privacy policy URL:** Your hosted privacy policy URL
   - **Data usage:** Select "User's website content" → "Local storage only"

5. Set Distribution:
   - **Visibility:** Public
   - **Distribution:** All regions (or select specific)

6. Submit for Review
   - Review typically takes 1-3 business days
   - You'll receive email notification

## After Approval

- [ ] Test the published extension
- [ ] Share the store link
- [ ] Monitor reviews and feedback
- [ ] Plan updates based on user feedback

## Store URLs

After publishing, your extension will be at:
`https://chrome.google.com/webstore/detail/tabfocus/[EXTENSION_ID]`

## Updating the Extension

1. Bump version in `manifest.json`
2. Run `npm run package`
3. Upload new zip in Developer Dashboard
4. Submit for review

---

## Files Ready

| File | Status | Location |
|------|--------|----------|
| Extension package | ✓ | Run `npm run package` |
| Store listing | ✓ | `store/STORE_LISTING.md` |
| Privacy policy | ✓ | `store/PRIVACY_POLICY.md` |
| Small promo (440x280) | ✓ | `store/promo-small.png` |
| Marquee promo (1400x560) | ✓ | `store/promo-marquee.png` |
| Screenshots | ❌ | Need to capture manually |
