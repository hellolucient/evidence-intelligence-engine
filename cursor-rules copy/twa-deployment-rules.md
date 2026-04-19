# Trusted Web Activity (TWA) Deployment Rules

Complete guide for deploying Progressive Web Apps (PWAs) as Android Trusted Web Activities (TWAs) for Solana dApp Store submission.

---

## Overview

A Trusted Web Activity (TWA) wraps your PWA in a native Android app shell, allowing it to be distributed through app stores while maintaining the full web experience. For Solana dApp Store, this enables seamless wallet integration via Mobile Wallet Adapter.

---

## Prerequisites

### Required Software
- **Node.js** (v18+)
- **Java Development Kit (JDK)** v17+ (via Bubblewrap: `~/.bubblewrap/jdk/jdk-17.0.11+9`)
- **Android Build Tools** v34.0.0+ (via Bubblewrap: `~/.bubblewrap/android_sdk/build-tools/34.0.0`)
- **Solana CLI** - For keypair management
- **Solana dApp Store CLI** - `npm install -g @solana-mobile/dapp-store-cli`
- **Bubblewrap CLI** - `npm install -g @bubblewrap/cli`

### Required Accounts
- **Solana Wallet** with SOL for transaction fees
- **Solana Mobile Discord** access (https://discord.gg/solanamobile)
- **Arweave Account** (for asset storage)

---

## Project Structure

```
your-project/
├── android/
│   ├── app/
│   │   ├── build.gradle          # App-level Gradle config
│   │   └── src/main/
│   │       ├── AndroidManifest.xml
│   │       ├── java/com/yourapp/LauncherActivity.java
│   │       └── res/
│   ├── gradle/
│   ├── releases/                 # Built APK files (gitignored)
│   ├── build.gradle              # Project-level Gradle config
│   ├── settings.gradle
│   ├── gradle.properties
│   ├── gradlew                   # Unix wrapper
│   ├── gradlew.bat               # Windows wrapper
│   ├── twa-manifest.json         # TWA configuration
│   ├── android.keystore           # Signing keystore (gitignored)
│   ├── keystore.properties       # Keystore credentials (gitignored)
│   ├── config.yaml               # Solana dApp Store config
│   └── local.properties          # Android SDK location
├── frontend/
│   ├── public/
│   │   ├── .well-known/
│   │   │   └── assetlinks.json  # Digital Asset Links (served statically)
│   │   └── manifest.json         # PWA manifest
│   └── app/
│       └── layout.tsx            # Root layout
└── [your web app files]
```

---

## Initial Setup

### 1. Create Android Keystore

**⚠️ CRITICAL: Keep this keystore secure! You cannot update your app without it.**

```bash
# Windows (PowerShell)
$keytoolPath = "$env:USERPROFILE\.bubblewrap\jdk\jdk-17.0.11+9\bin\keytool.exe"
& $keytoolPath -genkeypair -v -keystore android/android.keystore -alias android -keyalg RSA -keysize 2048 -validity 10000

# Linux/Mac
keytool -genkeypair -v -keystore android/android.keystore -alias android -keyalg RSA -keysize 2048 -validity 10000
```

**Store credentials securely:**
Create `android/keystore.properties`:
```properties
storePassword=YOUR_KEYSTORE_PASSWORD
keyPassword=YOUR_KEY_PASSWORD
keyAlias=android
storeFile=android.keystore
```

**⚠️ Add to `.gitignore`:** `android/keystore.properties`, `android/android.keystore`, `android/releases/`

### 2. Initialize TWA Project

```bash
cd android
npx @bubblewrap/cli init --manifest twa-manifest.json
```

### 3. Configure TWA Manifest (`android/twa-manifest.json`)

```json
{
  "packageId": "com.yourapp.name",
  "host": "yourdomain.com",
  "name": "Your App Name",
  "launcherName": "Your App",
  "display": "standalone",
  "themeColor": "#YOUR_COLOR",
  "themeColorDark": "#000000",
  "navigationColor": "#000000",
  "navigationColorDark": "#000000",
  "navigationDividerColor": "#000000",
  "navigationDividerColorDark": "#000000",
  "backgroundColor": "#000000",
  "enableNotifications": true,
  "startUrl": "/",
  "iconUrl": "https://yourdomain.com/icon.png",
  "maskableIconUrl": "https://yourdomain.com/icon.png",
  "splashScreenFadeOutDuration": 300,
  "signingKey": {
    "path": "android.keystore",
    "alias": "android"
  },
  "appVersionName": "1",
  "appVersionCode": 1,
  "shortcuts": [],
  "generatorApp": "bubblewrap-cli",
  "webManifestUrl": "https://yourdomain.com/manifest.json",
  "fallbackType": "customtabs",
  "features": {
    "locationDelegation": {
      "enabled": true
    }
  },
  "minSdkVersion": 21,
  "orientation": "portrait",
  "fingerprints": [
    {
      "sha256Fingerprint": "AA:BB:CC:DD:EE:FF:11:22:33:44:55:66:77:88:99:00:AA:BB:CC:DD:EE:FF:11:22:33:44:55:66:77:88:99:00"
    }
  ]
}
```

**Key Fields:**
- `packageId`: Reverse domain notation (e.g., `com.yourapp.name`)
- `host`: Your production domain (no `www.` prefix, or use `www.` if that's your actual domain)
- `fingerprints`: SHA-256 certificate fingerprint with colons (uppercase)

### 4. Configure PWA Manifest (`frontend/public/manifest.json`)

```json
{
  "name": "Your App Name",
  "short_name": "Your App",
  "start_url": "/",
  "display": "standalone",
  "display_override": ["standalone", "minimal-ui"],
  "background_color": "#000000",
  "theme_color": "#YOUR_COLOR",
  "orientation": "portrait",
  "icons": [
    {
      "src": "/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ]
}
```

**Critical:** `display: "standalone"` is required for TWA to hide the URL bar.

### 5. Configure Digital Asset Links (`frontend/public/.well-known/assetlinks.json`)

**⚠️ IMPORTANT: Serve as static file, NOT route handler**

Create `frontend/public/.well-known/assetlinks.json`:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.yourapp.name",
      "sha256_cert_fingerprints": [
        "AA:BB:CC:DD:EE:FF:11:22:33:44:55:66:77:88:99:00:AA:BB:CC:DD:EE:FF:11:22:33:44:55:66:77:88:99:00"
      ]
    }
  }
]
```

**Fingerprint Format Rules:**
- ✅ **Uppercase with colons:** `EA:78:51:A3:20:9B:...`
- ❌ Lowercase without colons: `ea7851a3209b...`
- ❌ Uppercase without colons: `EA7851A3209B...`
- ❌ Lowercase with colons: `ea:78:51:a3:...`

**Get Fingerprint:**
```bash
# From keystore
keytool -list -v -keystore android/android.keystore -alias android | Select-String "SHA256"

# From signed APK
apksigner verify --print-certs releases/app-release-signed.apk | Select-String "SHA-256"
```

**Note:** Convert lowercase/no-colons output to uppercase/with-colons format.

### 6. Configure Android App (`android/app/src/main/res/values/strings.xml`)

```xml
<resources>
  <string name="assetStatements">
    [{
        \"relation\": [\"delegate_permission/common.handle_all_urls\"],
        \"target\": {
            \"namespace\": \"web\",
            \"site\": \"https://yourdomain.com\"
        }
    }]
  </string>
</resources>
```

This creates the **app → website** link (required for two-way verification).

### 7. Configure Gradle Build (`android/app/build.gradle`)

```gradle
android {
    signingConfigs {
        release {
            def keystorePropertiesFile = rootProject.file("keystore.properties")
            if (keystorePropertiesFile.exists()) {
                def keystoreProperties = new Properties()
                keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
                storeFile rootProject.file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
            }
        }
    }
    buildTypes {
        release {
            minifyEnabled false  // Disable minification to avoid APK issues
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
            signingConfig signingConfigs.release
        }
    }
}
```

---

## Building the APK

### Step 1: Update Version Numbers

**Before building, increment version numbers in three places:**

1. **`android/app/build.gradle`:**
```gradle
defaultConfig {
    versionCode 2  // Increment this
    versionName "2"  // Increment this
}
```

2. **`android/twa-manifest.json`:**
```json
{
  "appVersionCode": 2,  // Increment this
  "appVersionName": "2"  // Increment this
}
```

3. **`android/config.yaml`:**
```yaml
android_details:
  version: '2'  # Increment this
  version_code: 2  # Increment this
```

### Step 2: Regenerate Android Project (if manifest changed)

```bash
cd android
npx @bubblewrap/cli update --manifest twa-manifest.json
```

### Step 3: Build Release APK

```bash
cd android
.\gradlew.bat clean assembleRelease  # Windows
# or
./gradlew clean assembleRelease      # Linux/Mac
```

### Step 4: Align and Sign APK

```bash
# Windows (PowerShell)
$zipalignPath = "$env:USERPROFILE\.bubblewrap\android_sdk\build-tools\34.0.0\zipalign.exe"
$apksignerPath = "$env:USERPROFILE\.bubblewrap\android_sdk\build-tools\34.0.0\apksigner.bat"
$keystoreProps = Get-Content "keystore.properties" | ConvertFrom-StringData

# Align
& $zipalignPath -v 4 app\build\outputs\apk\release\app-release-unsigned.apk releases\app-release-unsigned-aligned.apk

# Sign
& $apksignerPath sign --ks android.keystore --ks-key-alias android --ks-pass pass:$($keystoreProps.storePassword) --key-pass pass:$($keystoreProps.keyPassword) --out releases\app-release-signed.apk releases\app-release-unsigned-aligned.apk

# Verify
& $apksignerPath verify --print-certs releases\app-release-signed.apk
```

### Step 5: Verify Fingerprint Matches

```bash
# Get APK fingerprint
apksigner verify --print-certs releases/app-release-signed.apk | Select-String "SHA-256"

# Convert to colon format (uppercase)
# Example: ea7851a3... → EA:78:51:A3:...
```

**Ensure this matches exactly** what's in `frontend/public/.well-known/assetlinks.json`.

---

## Hiding the URL Bar

The URL bar will **only hide** if Digital Asset Links verification succeeds. This requires:

1. ✅ **Correct fingerprint format** (uppercase with colons)
2. ✅ **File accessible** at `https://yourdomain.com/.well-known/assetlinks.json`
3. ✅ **No redirects** (http→https, www→non-www)
4. ✅ **Correct Content-Type** (`application/json`)
5. ✅ **Two-way verification** (assetlinks.json + asset_statements)
6. ✅ **APK signed** with matching certificate

**After deploying assetlinks.json:**
- Wait 10-15 minutes for Google's cache to clear
- Uninstall app, clear Chrome cache, reinstall
- URL bar should hide automatically

**Verify with Google's tool:**
```
https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://yourdomain.com&relation=delegate_permission/common.handle_all_urls
```

---

## Common Issues & Solutions

### Issue: "package appears to be invalid" when installing APK

**Solution:**
1. Ensure APK is properly aligned (`zipalign`)
2. Sign with `apksigner` (not `jarsigner`)
3. Disable minification (`minifyEnabled false`)
4. Re-sign after alignment (zipalign breaks signature)

### Issue: URL bar still showing

**Solution:**
1. Verify fingerprint format (uppercase with colons)
2. Check file is accessible (no 404)
3. Ensure no redirects on domain
4. Wait for Google cache to clear (10-15 minutes)
5. Clear Chrome cache and reinstall app

### Issue: "malformed cert fingerprint" error

**Solution:**
1. Use uppercase with colons: `EA:78:51:A3:...`
2. Serve as static file (not route handler)
3. Ensure no extra whitespace or formatting
4. Match exact format from working example

### Issue: APK installs but shows wrong domain

**Solution:**
1. Regenerate Android project: `npx @bubblewrap/cli update --manifest twa-manifest.json`
2. Verify `twa-manifest.json` has correct `host` field
3. Check `build.gradle` has correct `hostName` in `twaManifest`
4. Rebuild APK

---

## Version Management

**Always sync these three files:**

1. `android/app/build.gradle` → `versionCode` and `versionName`
2. `android/twa-manifest.json` → `appVersionCode` and `appVersionName`
3. `android/config.yaml` → `android_details.version` and `android_details.version_code`

**Rule:** Each release must have a higher `versionCode` than the previous release.

---

## Best Practices

1. **Never commit keystore files** - Add to `.gitignore`
2. **Use environment variables** for keystore passwords in CI/CD
3. **Test APK installation** before submitting to store
4. **Verify fingerprint matches** before each release
5. **Serve assetlinks.json as static file** (not route handler)
6. **Wait for cache to clear** after deploying assetlinks.json
7. **Keep version numbers synced** across all config files
8. **Disable minification** for release builds (prevents APK issues)

---

## Testing Checklist

Before submitting to Solana dApp Store:

- [ ] APK installs successfully on device
- [ ] App loads correct domain/URL
- [ ] URL bar is hidden (Digital Asset Links verified)
- [ ] Wallet connection works (Mobile Wallet Adapter)
- [ ] Transactions sign correctly
- [ ] App works in portrait orientation
- [ ] Version numbers synced across all files
- [ ] Fingerprint matches in assetlinks.json
- [ ] assetlinks.json accessible and returns correct format
- [ ] No console errors in Chrome DevTools

---

## References

- [Android TWA Documentation](https://developer.chrome.com/docs/android/trusted-web-activity/)
- [Digital Asset Links Guide](https://developers.google.com/digital-asset-links/v1/getting-started)
- [Solana dApp Store Guide](../android.md)
- [Bubblewrap CLI](https://github.com/GoogleChromeLabs/bubblewrap)

