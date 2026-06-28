// Google Apps Script web app that holds the Google OAuth client secret and performs the token
// exchange/refresh the static GitHub Pages app can't do itself. Runs free inside your own
// Google account — no Cloudflare, no billing, no credit card.
//
// One-time setup:
//   1. https://script.google.com → New project → paste this file (replace the default code).
//   2. Project Settings (gear) → Script properties → add two properties:
//        GOOGLE_CLIENT_ID     = <your OAuth web client id>
//        GOOGLE_CLIENT_SECRET = <your OAuth web client secret>
//   3. Deploy → New deployment → type "Web app" →
//        Execute as: Me          (so it can read the secret above)
//        Who has access: Anyone  (the app calls it without a Google login)
//      → Deploy → copy the "/exec" Web app URL → paste it into the app's Settings.
//   After editing this code later, use Deploy → Manage deployments → edit (pencil) →
//   "New version" so the same /exec URL keeps working.
//
// The app POSTs JSON as text/plain (a "simple" request, so the browser skips the CORS preflight
// that Apps Script web apps can't answer). Apps Script always replies 200, so errors come back
// in the JSON body, not via HTTP status:
//   { action: 'exchange', code, code_verifier, redirect_uri } -> { access_token, refresh_token, expires_in }
//   { action: 'refresh',  refresh_token }                     -> { access_token, expires_in }

var TOKEN_URL = 'https://oauth2.googleapis.com/token';

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var props = PropertiesService.getScriptProperties();
    var clientId = props.getProperty('GOOGLE_CLIENT_ID');
    var clientSecret = props.getProperty('GOOGLE_CLIENT_SECRET');

    var params;
    if (body.action === 'exchange') {
      params = {
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code: body.code,
        code_verifier: body.code_verifier,
        redirect_uri: body.redirect_uri,
      };
    } else if (body.action === 'refresh') {
      params = {
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: body.refresh_token,
      };
    } else {
      return json({ error: 'unknown_action' });
    }

    var res = UrlFetchApp.fetch(TOKEN_URL, {
      method: 'post',
      payload: params, // a plain object is sent form-encoded, as Google's token endpoint expects
      muteHttpExceptions: true,
    });
    var data = JSON.parse(res.getContentText());
    if (data.error) return json({ error: data.error, error_description: data.error_description });

    // Forward only what the app needs (don't leak id_token).
    var out = { access_token: data.access_token, expires_in: data.expires_in };
    if (data.refresh_token) out.refresh_token = data.refresh_token; // present on exchange / if rotated
    return json(out);
  } catch (err) {
    return json({ error: 'bad_request', detail: String(err) });
  }
}

// Opening the /exec URL in a browser shows this — a quick "is it deployed?" check.
function doGet() {
  return json({ ok: true, service: 'field-service token endpoint' });
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
