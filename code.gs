// Code.gs — Writing Assessment Tool
// Ulysses Cabayao, SJ (2024)
// Debugged & optimized June 2026

/**
 * Adds the Writing Assessment menu to Google Docs on open.
 */
function onOpen() {
  DocumentApp.getUi()
    .createMenu('Writing Assessment')
    .addItem('Upload Rubric...', 'showUploadOptions')
    .addItem('Assess Writing', 'assessWriting')
    .addItem('Clear Rubric', 'clearRubric')
    .addToUi();
}

/**
 * Shows the rubric upload dialog.
 */
function showUploadOptions() {
  var html = HtmlService.createHtmlOutputFromFile('UploadOptions')
    .setWidth(420)
    .setHeight(350);
  DocumentApp.getUi().showModalDialog(html, 'Upload Rubric');
}

// ─── Rubric Upload ─────────────────────────────────────────────────

/**
 * Uploads a rubric from a Google Drive URL.
 * @param {string} fileUrl A Google Drive share link.
 * @returns {{success: boolean, message: string}}
 */
function uploadRubricFromDrive(fileUrl) {
  var fileId = extractFileIdFromUrl(fileUrl);
  if (!fileId) {
    return { success: false, message: 'Invalid Google Drive URL. Make sure you\'re using a valid share link.' };
  }

  var file = DriveApp.getFileById(fileId);

  // Validate it's a PDF or a Google Doc
  var mimeType = file.getMimeType();
  if (mimeType !== 'application/pdf' && mimeType !== 'application/vnd.google-apps.document') {
    return { success: false, message: 'Only PDF files and Google Docs are supported as rubrics.' };
  }

  var rubricFolder = getOrCreateRubricFolder();
  var newFile = file.makeCopy('Rubric - ' + new Date().toISOString().slice(0, 10), rubricFolder);

  var userProps = PropertiesService.getUserProperties();
  userProps.setProperty('rubricFileId', newFile.getId());
  // Clear cached interpretation since rubric changed
  userProps.deleteProperty('interpretedRubric');

  return { success: true, message: 'Rubric uploaded successfully from Google Drive! Ready to assess.' };
}

/**
 * Uploads a rubric from a local file (base64-encoded by the browser).
 * @param {string} base64Content The base64-encoded file content (without header).
 * @returns {{success: boolean, message: string}}
 */
function uploadRubricFromLocal(base64Content) {
  if (!base64Content) {
    return { success: false, message: 'No file content received.' };
  }

  var blob = Utilities.newBlob(Utilities.base64Decode(base64Content), MimeType.PDF, 'Rubric.pdf');
  var rubricFolder = getOrCreateRubricFolder();
  var file = rubricFolder.createFile(blob);

  var userProps = PropertiesService.getUserProperties();
  userProps.setProperty('rubricFileId', file.getId());
  // Clear cached interpretation since rubric changed
  userProps.deleteProperty('interpretedRubric');

  return { success: true, message: 'Rubric uploaded successfully from local file! Ready to assess.' };
}

/**
 * Clears the currently stored rubric.
 */
function clearRubric() {
  var userProps = PropertiesService.getUserProperties();
  userProps.deleteProperty('rubricFileId');
  userProps.deleteProperty('interpretedRubric');
  userProps.deleteProperty('rubricFolderId');
  DocumentApp.getUi().alert('Cleared', 'The stored rubric has been cleared.', DocumentApp.getUi().ButtonSet.OK);
}

// ─── Rubric Folder Management ──────────────────────────────────────

/**
 * Gets or creates the rubric storage folder. Caches the folder ID for speed.
 * @returns {Folder} The rubric folder.
 */
function getOrCreateRubricFolder() {
  var userProps = PropertiesService.getUserProperties();
  var cachedId = userProps.getProperty('rubricFolderId');

  if (cachedId) {
    try {
      return DriveApp.getFolderById(cachedId);
    } catch (e) {
      // Folder was deleted — create a new one
    }
  }

  var folderName = 'Writing Assessment Rubrics';
  var folders = DriveApp.getFoldersByName(folderName);

  var folder;
  if (folders.hasNext()) {
    folder = folders.next();
  } else {
    folder = DriveApp.createFolder(folderName);
  }

  userProps.setProperty('rubricFolderId', folder.getId());
  return folder;
}

// ─── File ID Extraction ────────────────────────────────────────────

/**
 * Extracts a Google Drive file ID from various URL formats.
 * Supports:
 *   - https://drive.google.com/file/d/FILE_ID/view
 *   - https://docs.google.com/document/d/FILE_ID/edit
 *   - https://drive.google.com/open?id=FILE_ID
 * @param {string} url A Google Drive share URL.
 * @returns {string|null} The file ID, or null if not found.
 */
function extractFileIdFromUrl(url) {
  if (!url || typeof url !== 'string') return null;

  // Pattern 1: /d/ID/ or /d/ID
  var match = url.match(/\/d\/([\w-]{25,})[\/?]/);
  if (match) return match[1];

  // Pattern 2: ?id=ID or &id=ID
  match = url.match(/[?&]id=([\w-]{25,})/);
  if (match) return match[1];

  // Pattern 3: open?id=ID
  match = url.match(/open\?id=([\w-]{25,})/);
  if (match) return match[1];

  return null;
}

// ─── Writing Assessment ────────────────────────────────────────────

/**
 * Assesses the active document's content against the uploaded rubric.
 * Sends rubric text (not raw binary) to the LLM for assessment.
 */
function assessWriting() {
  var doc = DocumentApp.getActiveDocument();
  var bodyText = doc.getBody().getText().trim();
  var ui = DocumentApp.getUi();

  // ── Step 1: Validate ──
  if (!bodyText || bodyText.length < 50) {
    ui.alert(
      'Insufficient Content',
      'The document is empty or very short. Please add at least a paragraph of writing before assessing.',
      ui.ButtonSet.OK
    );
    return;
  }

  var userProps = PropertiesService.getUserProperties();
  var rubricFileId = userProps.getProperty('rubricFileId');

  if (!rubricFileId) {
    ui.alert(
      'No Rubric',
      'Please upload a rubric first using the "Upload Rubric" menu item.',
      ui.ButtonSet.OK
    );
    return;
  }

  // ── Step 2: Get rubric text ──
  var rubricText = userProps.getProperty('interpretedRubric');

  if (!rubricText) {
    // Need to interpret the rubric first — prompt the user for server URL
    var serverResponse = ui.prompt(
      'AI Server',
      'Enter the OpenAI-compatible API endpoint URL (e.g., https://api.openai.com/v1):',
      ui.ButtonSet.OK_CANCEL
    );

    if (serverResponse.getSelectedButton() !== ui.Button.OK) return;

    var serverUrl = serverResponse.getResponseText().trim().replace(/\/+$/, '');
    if (!serverUrl) {
      ui.alert('Error', 'No server URL provided.', ui.ButtonSet.OK);
      return;
    }

    // Prompt for API key (stored in UserProperties for the session)
    var apiKeyResponse = ui.prompt(
      'API Key',
      'Enter your API key (stored per-user, not saved to disk):',
      ui.ButtonSet.OK_CANCEL
    );
    if (apiKeyResponse.getSelectedButton() !== ui.Button.OK) return;
    var apiKey = apiKeyResponse.getResponseText().trim();
    if (!apiKey) {
      ui.alert('Error', 'No API key provided.', ui.ButtonSet.OK);
      return;
    }

    // Show a brief "working" alert (Google Apps Script limitation - we close it after)
    ui.alert(
      'Processing...',
      'Interpreting rubric PDF. This may take 10–20 seconds. Please wait...',
      ui.ButtonSet.OK
    );

    rubricText = interpretRubric(rubricFileId, serverUrl, apiKey, ui);
    if (!rubricText) return; // Error already shown to user

    // Cache the interpreted rubric so subsequent assessments skip this step
    userProps.setProperty('interpretedRubric', rubricText);
  }

  // ── Step 3: Assess writing ──
  ui.alert(
    'Processing...',
    'Assessing writing. This may take 10–15 seconds. Please wait...',
    ui.ButtonSet.OK
  );

  // We need the server URL and API key again if cached
  // For now, prompt each time (could store in UserProperties as an option)
  var serverResponse = ui.prompt(
    'AI Server',
    'Enter the OpenAI-compatible API endpoint URL (or press Cancel to use the previous one):',
    ui.ButtonSet.OK_CANCEL
  );
  if (serverResponse.getSelectedButton() !== ui.Button.OK) return;
  var serverUrl = serverResponse.getResponseText().trim().replace(/\/+$/, '');
  if (!serverUrl) return;

  var apiKeyResponse = ui.prompt(
    'API Key',
    'Enter your API key:',
    ui.ButtonSet.OK_CANCEL
  );
  if (apiKeyResponse.getSelectedButton() !== ui.Button.OK) return;
  var apiKey = apiKeyResponse.getResponseText().trim();
  if (!apiKey) return;

  var assessment = assessAgainstRubric(bodyText, rubricText, serverUrl, apiKey);
  if (!assessment) return; // Error already handled

  // ── Step 4: Create result document ──
  var safeDate = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
  var newDoc = DocumentApp.create('Writing Assessment - ' + safeDate);
  newDoc.getBody().appendParagraph(assessment);

  // Insert a link back in the original document
  var docUrl = newDoc.getUrl();
  var paragraph = doc.getBody().appendParagraph('');
  paragraph.appendText('✅ Assessment completed. ');
  var linkText = paragraph.appendText('View assessment here.');
  linkText.setLinkUrl(docUrl);
  linkText.setBold(true);

  ui.alert(
    'Assessment Complete',
    'The assessment has been created in a new document titled "Writing Assessment - ' + safeDate + '".\n\nA link has been added to the end of your current document.',
    ui.ButtonSet.OK
  );
}

// ─── API Calls ─────────────────────────────────────────────────────

/**
 * Sends the rubric PDF to the server for text interpretation via vision.
 * @param {string} fileId   Google Drive file ID of the rubric.
 * @param {string} serverUrl API base URL.
 * @param {string} apiKey    API key.
 * @param {Ui}     ui       Google Docs UI instance (for error dialogs).
 * @returns {string|null} Extracted rubric text, or null on failure.
 */
function interpretRubric(fileId, serverUrl, apiKey, ui) {
  try {
    var rubricFile = DriveApp.getFileById(fileId);
    var mimeType = rubricFile.getMimeType();

    var rubricContent;
    var imageData;

    if (mimeType === 'application/vnd.google-apps.document') {
      // Google Doc: extract text directly
      rubricContent = rubricFile.getBlob().getDataAsString();
    } else {
      // PDF: read bytes and send as a multimodal image (first page as PNG)
      // Apps Script limitation: we can't easily render PDF pages.
      // Fallback: send PDF bytes in a format the API can handle.
      var bytes = rubricFile.getBlob().getBytes();
      var base64 = Utilities.base64Encode(bytes);

      // Construct a vision-style request with the PDF as base64 data
      // Many OpenAI-compatible APIs accept data:application/pdf;base64,...
      var payload = {
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'You are an expert at interpreting academic rubrics. Extract all assessment criteria, scoring guidelines, and standards from this PDF document. Return ONLY the rubric content as plain text — no commentary or analysis.'
              },
              {
                type: 'image_url',
                image_url: {
                  url: 'data:application/pdf;base64,' + base64
                }
              }
            ]
          }
        ],
        max_tokens: 4000,
        temperature: 0.1
      };

      var options = makeApiOptions(payload, apiKey);
      var response = UrlFetchApp.fetch(serverUrl + '/chat/completions', options);
      var result = parseApiResponse(response);
      if (!result) {
        ui.alert('Error', 'Failed to interpret rubric from the server.', ui.ButtonSet.OK);
        return null;
      }
      return result;
    }

    // If it was a Google Doc, send the text directly for interpretation
    var payload = {
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are an expert at interpreting academic rubrics. Extract all assessment criteria, scoring guidelines, and standards. Return ONLY the rubric content as plain text — no commentary.'
        },
        {
          role: 'user',
          content: 'Here is the rubric document content:\n\n' + rubricContent
        }
      ],
      max_tokens: 4000,
      temperature: 0.1
    };

    var options = makeApiOptions(payload, apiKey);
    var response = UrlFetchApp.fetch(serverUrl + '/chat/completions', options);
    var result = parseApiResponse(response);
    if (!result) {
      ui.alert('Error', 'Failed to interpret rubric from the server.', ui.ButtonSet.OK);
      return null;
    }
    return result;

  } catch (error) {
    ui.alert(
      'Connection Error',
      'Failed to connect to AI server: ' + error.message + '\n\nMake sure the server URL and API key are correct.',
      ui.ButtonSet.OK
    );
    return null;
  }
}

/**
 * Sends the student writing + rubric to the server for assessment.
 * @param {string} bodyText    The student's writing.
 * @param {string} rubricText  The interpreted rubric text.
 * @param {string} serverUrl   API base URL.
 * @param {string} apiKey      API key.
 * @returns {string|null} Assessment text, or null on failure.
 */
function assessAgainstRubric(bodyText, rubricText, serverUrl, apiKey) {
  try {
    var systemPrompt = 'You are an Ivy League college professor assessing academic writing. ' +
      'Evaluate the student\'s work based on the provided rubric. Give detailed, constructive feedback ' +
      'on: argument/claim, grammar/style, structure/organization, content/knowledge, and scholarly ' +
      'conventions. Include specific examples from the student\'s writing. ' +
      'End with an overall assessment and suggested grade/rating.\n\n' +
      '=== RUBRIC ===\n' + rubricText;

    var payload = {
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Assess the following student writing:\n\n' + bodyText }
      ],
      max_tokens: 2000,
      temperature: 0.7
    };

    var options = makeApiOptions(payload, apiKey);
    var response = UrlFetchApp.fetch(serverUrl + '/chat/completions', options);
    var result = parseApiResponse(response);

    if (!result) {
      DocumentApp.getUi().alert('Error', 'Failed to get assessment from the server.', DocumentApp.getUi().ButtonSet.OK);
      return null;
    }
    return result;

  } catch (error) {
    DocumentApp.getUi().alert(
      'Connection Error',
      'Failed to connect to AI server: ' + error.message,
      DocumentApp.getUi().ButtonSet.OK
    );
    return null;
  }
}

// ─── API Helpers ───────────────────────────────────────────────────

/**
 * Constructs a UrlFetchApp options object for an OpenAI-compatible API.
 * @param {object} payload  The JSON payload body.
 * @param {string} apiKey   The API key.
 * @returns {object} Options for UrlFetchApp.fetch().
 */
function makeApiOptions(payload, apiKey) {
  return {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': 'Bearer ' + apiKey
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
    timeout: 120  // 2-minute timeout for long LLM responses
  };
}

/**
 * Parses an OpenAI-compatible chat completion response.
 * @param {HTTPResponse} response The UrlFetchApp response.
 * @returns {string|null} The assistant's message content, or null on failure.
 */
function parseApiResponse(response) {
  var code = response.getResponseCode();
  if (code !== 200) {
    var errorBody = response.getContentText();
    try {
      var errorJson = JSON.parse(errorBody);
      Logger.log('API Error: ' + (errorJson.error ? errorJson.error.message : errorBody));
    } catch (e) {
      Logger.log('API Error (HTTP ' + code + '): ' + errorBody);
    }
    return null;
  }

  var data = JSON.parse(response.getContentText());
  if (
    data.choices &&
    data.choices.length > 0 &&
    data.choices[0].message &&
    data.choices[0].message.content
  ) {
    return data.choices[0].message.content.trim();
  }

  Logger.log('Unexpected API response structure: ' + JSON.stringify(data));
  return null;
}
