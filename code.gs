// Code.gs — Writing Assessment Tool with OpenRouter
// Ulysses Cabayao, SJ (2024) — OpenRouter integration June 2026

// ─── Configuration Defaults ────────────────────────────────────────

var CONFIG = {
  DEFAULT_BASE_URL: 'https://openrouter.ai/api/v1',
  DEFAULT_VISION_MODEL: 'openai/gpt-4o',
  DEFAULT_ASSESS_MODEL: 'openai/gpt-4o',
  STORAGE_KEYS: {
    apiKey: 'or_apiKey',
    baseUrl: 'or_baseUrl',
    visionModel: 'or_visionModel',
    assessModel: 'or_assessModel',
    rubricFileId: 'rubricFileId',
    interpretedRubric: 'interpretedRubric',
    rubricFolderId: 'rubricFolderId'
  }
};

// ─── Menu ──────────────────────────────────────────────────────────

function onOpen() {
  DocumentApp.getUi()
    .createMenu('Writing Assessment')
    .addItem('Upload Rubric...', 'showUploadOptions')
    .addItem('Assess Writing', 'assessWriting')
    .addItem('⚙ OpenRouter Settings...', 'showSettings')
    .addItem('Clear Rubric', 'clearRubric')
    .addToUi();
}

// ─── Settings ──────────────────────────────────────────────────────

/**
 * Shows the OpenRouter settings dialog.
 */
function showSettings() {
  var html = HtmlService.createHtmlOutputFromFile('Settings')
    .setWidth(480)
    .setHeight(380);
  DocumentApp.getUi().showModalDialog(html, 'OpenRouter Settings');
}

/**
 * Loads current settings for the settings dialog.
 * @returns {{apiKey: string, baseUrl: string, visionModel: string, assessModel: string}}
 */
function loadSettings() {
  var props = PropertiesService.getUserProperties();
  return {
    apiKey: props.getProperty(CONFIG.STORAGE_KEYS.apiKey) || '',
    baseUrl: props.getProperty(CONFIG.STORAGE_KEYS.baseUrl) || CONFIG.DEFAULT_BASE_URL,
    visionModel: props.getProperty(CONFIG.STORAGE_KEYS.visionModel) || CONFIG.DEFAULT_VISION_MODEL,
    assessModel: props.getProperty(CONFIG.STORAGE_KEYS.assessModel) || CONFIG.DEFAULT_ASSESS_MODEL
  };
}

/**
 * Saves OpenRouter settings from the dialog.
 * @param {{apiKey: string, baseUrl: string, visionModel: string, assessModel: string}} settings
 * @returns {{success: boolean, message: string}}
 */
function saveSettings(settings) {
  if (!settings.apiKey || settings.apiKey.trim() === '') {
    return { success: false, message: 'API key is required.' };
  }

  var props = PropertiesService.getUserProperties();
  props.setProperty(CONFIG.STORAGE_KEYS.apiKey, settings.apiKey.trim());
  props.setProperty(CONFIG.STORAGE_KEYS.baseUrl, settings.baseUrl.trim().replace(/\/+$/, '') || CONFIG.DEFAULT_BASE_URL);
  props.setProperty(CONFIG.STORAGE_KEYS.visionModel, settings.visionModel.trim() || CONFIG.DEFAULT_VISION_MODEL);
  props.setProperty(CONFIG.STORAGE_KEYS.assessModel, settings.assessModel.trim() || CONFIG.DEFAULT_ASSESS_MODEL);

  return { success: true, message: 'Settings saved successfully!' };
}

// ─── Rubric Upload ─────────────────────────────────────────────────

function showUploadOptions() {
  var html = HtmlService.createHtmlOutputFromFile('UploadOptions')
    .setWidth(420)
    .setHeight(350);
  DocumentApp.getUi().showModalDialog(html, 'Upload Rubric');
}

function uploadRubricFromDrive(fileUrl) {
  var fileId = extractFileIdFromUrl(fileUrl);
  if (!fileId) {
    return { success: false, message: 'Invalid Google Drive URL. Make sure you\'re using a valid share link.' };
  }

  var file = DriveApp.getFileById(fileId);
  var mimeType = file.getMimeType();
  if (mimeType !== 'application/pdf' && mimeType !== 'application/vnd.google-apps.document') {
    return { success: false, message: 'Only PDF files and Google Docs are supported as rubrics.' };
  }

  var rubricFolder = getOrCreateRubricFolder();
  var newFile = file.makeCopy('Rubric - ' + new Date().toISOString().slice(0, 10), rubricFolder);

  var props = PropertiesService.getUserProperties();
  props.setProperty(CONFIG.STORAGE_KEYS.rubricFileId, newFile.getId());
  props.deleteProperty(CONFIG.STORAGE_KEYS.interpretedRubric); // Clear cache

  return { success: true, message: 'Rubric uploaded successfully from Google Drive! Ready to assess.' };
}

function uploadRubricFromLocal(base64Content) {
  if (!base64Content) {
    return { success: false, message: 'No file content received.' };
  }

  var blob = Utilities.newBlob(Utilities.base64Decode(base64Content), MimeType.PDF, 'Rubric.pdf');
  var rubricFolder = getOrCreateRubricFolder();
  var file = rubricFolder.createFile(blob);

  var props = PropertiesService.getUserProperties();
  props.setProperty(CONFIG.STORAGE_KEYS.rubricFileId, file.getId());
  props.deleteProperty(CONFIG.STORAGE_KEYS.interpretedRubric);

  return { success: true, message: 'Rubric uploaded successfully from local file! Ready to assess.' };
}

function clearRubric() {
  var props = PropertiesService.getUserProperties();
  props.deleteProperty(CONFIG.STORAGE_KEYS.rubricFileId);
  props.deleteProperty(CONFIG.STORAGE_KEYS.interpretedRubric);
  props.deleteProperty(CONFIG.STORAGE_KEYS.rubricFolderId);
  DocumentApp.getUi().alert('Cleared', 'The stored rubric has been cleared.', DocumentApp.getUi().ButtonSet.OK);
}

// ─── Rubric Folder ─────────────────────────────────────────────────

function getOrCreateRubricFolder() {
  var props = PropertiesService.getUserProperties();
  var cachedId = props.getProperty(CONFIG.STORAGE_KEYS.rubricFolderId);

  if (cachedId) {
    try {
      return DriveApp.getFolderById(cachedId);
    } catch (e) { /* deleted — recreate */ }
  }

  var folderName = 'Writing Assessment Rubrics';
  var folders = DriveApp.getFoldersByName(folderName);
  var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);

  props.setProperty(CONFIG.STORAGE_KEYS.rubricFolderId, folder.getId());
  return folder;
}

// ─── File ID Extraction ────────────────────────────────────────────

function extractFileIdFromUrl(url) {
  if (!url || typeof url !== 'string') return null;

  var match = url.match(/\/d\/([\w-]{25,})[\/?]/);
  if (match) return match[1];

  match = url.match(/[?&]id=([\w-]{25,})/);
  if (match) return match[1];

  match = url.match(/open\?id=([\w-]{25,})/);
  if (match) return match[1];

  return null;
}

// ─── Writing Assessment ────────────────────────────────────────────

function assessWriting() {
  var doc = DocumentApp.getActiveDocument();
  var bodyText = doc.getBody().getText().trim();
  var ui = DocumentApp.getUi();
  var props = PropertiesService.getUserProperties();

  // ── Step 1: Validate ──
  if (!bodyText || bodyText.length < 50) {
    ui.alert('Insufficient Content', 'The document is empty or very short. Please add at least a paragraph of writing before assessing.', ui.ButtonSet.OK);
    return;
  }

  var rubricFileId = props.getProperty(CONFIG.STORAGE_KEYS.rubricFileId);
  if (!rubricFileId) {
    ui.alert('No Rubric', 'Please upload a rubric first using the "Upload Rubric" menu item.', ui.ButtonSet.OK);
    return;
  }

  var apiKey = props.getProperty(CONFIG.STORAGE_KEYS.apiKey);
  var baseUrl = props.getProperty(CONFIG.STORAGE_KEYS.baseUrl) || CONFIG.DEFAULT_BASE_URL;

  // ── Step 2: Check OpenRouter config ──
  if (!apiKey) {
    var setup = ui.alert(
      'OpenRouter Not Configured',
      'You need to set up your OpenRouter API key first.\n\nOpen Settings now?',
      ui.ButtonSet.YES_NO
    );
    if (setup == ui.Button.YES) {
      showSettings();
    }
    return;
  }

  // ── Step 3: Get rubric text (cached or fresh) ──
  var rubricText = props.getProperty(CONFIG.STORAGE_KEYS.interpretedRubric);

  if (!rubricText) {
    ui.alert('Processing...', 'Interpreting rubric PDF via OpenRouter. This may take 10–30 seconds. Please wait...', ui.ButtonSet.OK);

    rubricText = interpretRubric(rubricFileId, baseUrl, apiKey, ui);
    if (!rubricText) return;

    props.setProperty(CONFIG.STORAGE_KEYS.interpretedRubric, rubricText);
  }

  // ── Step 4: Assess writing ──
  ui.alert('Processing...', 'Assessing writing via OpenRouter. This may take 10–20 seconds. Please wait...', ui.ButtonSet.OK);

  var assessment = assessAgainstRubric(bodyText, rubricText, baseUrl, apiKey);
  if (!assessment) return;

  // ── Step 5: Create result document ──
  var safeDate = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
  var newDoc = DocumentApp.create('Writing Assessment - ' + safeDate);
  newDoc.getBody().appendParagraph(assessment);

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

// ─── API: Rubric Interpretation ────────────────────────────────────

/**
 * Extracts rubric text from a PDF (via vision) or Google Doc.
 * @param {string} fileId   Google Drive file ID
 * @param {string} baseUrl  OpenRouter base URL
 * @param {string} apiKey   OpenRouter API key
 * @param {Ui}     ui       For error dialogs
 * @returns {string|null}   Extracted rubric text
 */
function interpretRubric(fileId, baseUrl, apiKey, ui) {
  try {
    var props = PropertiesService.getUserProperties();
    var model = props.getProperty(CONFIG.STORAGE_KEYS.visionModel) || CONFIG.DEFAULT_VISION_MODEL;
    var file = DriveApp.getFileById(fileId);
    var mimeType = file.getMimeType();
    var payload;

    if (mimeType === 'application/vnd.google-apps.document') {
      // Google Doc: text-only extraction — no vision needed
      var text = file.getBlob().getDataAsString();
      payload = {
        model: model,
        messages: [
          {
            role: 'system',
            content: 'You are an expert at interpreting academic rubrics. Extract all assessment criteria, scoring guidelines, and standards from the rubric text below. Return ONLY the rubric content as clean, structured plain text — no commentary, no analysis, no greeting.'
          },
          {
            role: 'user',
            content: 'Here is the rubric document content:\n\n' + text
          }
        ],
        max_tokens: 4000,
        temperature: 0.1
      };
    } else {
      // PDF: send via vision/multimodal
      var bytes = file.getBlob().getBytes();
      var base64 = Utilities.base64Encode(bytes);

      payload = {
        model: model,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'You are an expert at interpreting academic rubrics. Extract all assessment criteria, scoring guidelines, and standards from this PDF document. Return ONLY the rubric content as clean, structured plain text — no commentary, no analysis.'
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
    }

    var options = makeApiOptions(payload, apiKey);
    var response = UrlFetchApp.fetch(baseUrl + '/chat/completions', options);
    var result = parseApiResponse(response);

    if (!result) {
      ui.alert('Error', 'Failed to interpret rubric via OpenRouter. Check your model selection and API key in Settings.', ui.ButtonSet.OK);
      return null;
    }
    return result;

  } catch (error) {
    ui.alert(
      'Connection Error',
      'Failed to connect to OpenRouter: ' + error.message + '\n\nCheck your API key and base URL in Settings (Writing Assessment → OpenRouter Settings).',
      ui.ButtonSet.OK
    );
    return null;
  }
}

// ─── API: Writing Assessment ───────────────────────────────────────

/**
 * Assesses student writing against the rubric via OpenRouter.
 * @param {string} bodyText   Student's writing
 * @param {string} rubricText Interpreted rubric text
 * @param {string} baseUrl    OpenRouter base URL
 * @param {string} apiKey     OpenRouter API key
 * @returns {string|null}     Assessment text
 */
function assessAgainstRubric(bodyText, rubricText, baseUrl, apiKey) {
  try {
    var props = PropertiesService.getUserProperties();
    var model = props.getProperty(CONFIG.STORAGE_KEYS.assessModel) || CONFIG.DEFAULT_ASSESS_MODEL;

    var systemPrompt = 'You are an Ivy League college professor assessing academic writing. ' +
      'Evaluate the student\'s work based on the provided rubric. Give detailed, constructive feedback ' +
      'on: argument/claim, grammar/style, structure/organization, content/knowledge, and scholarly ' +
      'conventions. Include specific examples from the student\'s writing. ' +
      'End with an overall assessment and suggested grade/rating.\n\n' +
      '=== RUBRIC ===\n' + rubricText;

    var payload = {
      model: model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Assess the following student writing:\n\n' + bodyText }
      ],
      max_tokens: 2000,
      temperature: 0.7
    };

    var options = makeApiOptions(payload, apiKey);
    var response = UrlFetchApp.fetch(baseUrl + '/chat/completions', options);
    var result = parseApiResponse(response);

    if (!result) {
      DocumentApp.getUi().alert('Error', 'Failed to get assessment from OpenRouter. Check your model selection and API key.', DocumentApp.getUi().ButtonSet.OK);
      return null;
    }
    return result;

  } catch (error) {
    DocumentApp.getUi().alert(
      'Connection Error',
      'Failed to connect to OpenRouter: ' + error.message,
      DocumentApp.getUi().ButtonSet.OK
    );
    return null;
  }
}

// ─── API Helpers ───────────────────────────────────────────────────

/**
 * Builds UrlFetchApp options for OpenRouter API calls.
 * Adds OpenRouter-specific headers (HTTP-Referer, X-Title).
 * @param {object} payload  JSON payload body
 * @param {string} apiKey   OpenRouter API key
 * @returns {object}        UrlFetchApp options
 */
function makeApiOptions(payload, apiKey) {
  return {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': 'Bearer ' + apiKey,
      'HTTP-Referer': 'https://github.com/uscabayaosj/PaperFeedback',
      'X-Title': 'PaperFeedback Writing Assessment'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
    timeout: 120
  };
}

/**
 * Parses an OpenAI-compatible chat completion response.
 * @param {HTTPResponse} response  UrlFetchApp response
 * @returns {string|null}          Assistant message content, or null
 */
function parseApiResponse(response) {
  var code = response.getResponseCode();
  if (code !== 200) {
    var body = response.getContentText();
    try {
      var err = JSON.parse(body);
      Logger.log('API Error: ' + (err.error ? err.error.message + (err.error.metadata ? ' | ' + JSON.stringify(err.error.metadata) : '') : body));
    } catch (e) {
      Logger.log('API Error (HTTP ' + code + '): ' + body);
    }
    return null;
  }

  var data = JSON.parse(response.getContentText());
  if (data.choices && data.choices.length > 0 && data.choices[0].message && data.choices[0].message.content) {
    return data.choices[0].message.content.trim();
  }

  Logger.log('Unexpected API response: ' + JSON.stringify(data).substring(0, 500));
  return null;
}
