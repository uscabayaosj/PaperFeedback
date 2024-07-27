// Code.gs
function onOpen() {
  DocumentApp.getUi().createMenu('Writing Assessment')
      .addItem('Upload Rubric', 'showUploadOptions')
      .addItem('Assess Writing', 'assessWriting')
      .addToUi();
}

function showUploadOptions() {
  var html = HtmlService.createHtmlOutputFromFile('UploadOptions')
      .setWidth(400)
      .setHeight(300);
  DocumentApp.getUi().showModalDialog(html, 'Upload Rubric');
}

function uploadRubricFromDrive(fileUrl) {
  var fileId = extractFileIdFromUrl(fileUrl);
  if (!fileId) {
    return {success: false, message: 'Invalid file URL. Please make sure you\'re using a Google Drive link.'};
  }
  
  var file = DriveApp.getFileById(fileId);
  var rubricFolder = getRubricFolder();
  var newFile = file.makeCopy('Rubric', rubricFolder);
  
  PropertiesService.getScriptProperties().setProperty('rubricFileId', newFile.getId());
  return {success: true, message: 'Rubric uploaded successfully from Google Drive!'};
}

function uploadRubricFromLocal(base64Content) {
  var blob = Utilities.newBlob(Utilities.base64Decode(base64Content), MimeType.PDF, 'Rubric.pdf');
  var rubricFolder = getRubricFolder();
  var file = rubricFolder.createFile(blob);
  
  PropertiesService.getScriptProperties().setProperty('rubricFileId', file.getId());
  return {success: true, message: 'Rubric uploaded successfully from local file!'};
}

function getRubricFolder() {
  var folderName = 'Writing Assessment Rubrics';
  var folders = DriveApp.getFoldersByName(folderName);
  
  if (folders.hasNext()) {
    return folders.next();
  } else {
    return DriveApp.createFolder(folderName);
  }
}

function extractFileIdFromUrl(url) {
  var match = url.match(/[-\w]{25,}/);
  return match ? match[0] : null;
}

function assessWriting() {
  var doc = DocumentApp.getActiveDocument();
  var body = doc.getBody().getText();
  
  var ui = DocumentApp.getUi();
  var rubricFileId = PropertiesService.getScriptProperties().getProperty('rubricFileId');
  
  if (!rubricFileId) {
    ui.alert('Error', 'Please upload a rubric first using the "Upload Rubric" menu item.', ui.ButtonSet.OK);
    return;
  }
  
  var rubricFile = DriveApp.getFileById(rubricFileId);
  var rubricContent = rubricFile.getBlob().getBytes();
  var rubricBase64 = Utilities.base64Encode(rubricContent);
  
  var serverResponse = ui.prompt('LMS Studio Server', 'Enter the LMS Studio server URL:', ui.ButtonSet.OK_CANCEL);
  
  if (serverResponse.getSelectedButton() == ui.Button.OK) {
    var serverUrl = serverResponse.getResponseText().trim();
    
    if (serverUrl.endsWith('/')) {
      serverUrl = serverUrl.slice(0, -1);
    }
    
    // First, send the PDF to the AI for interpretation
    var rubricInterpretationOptions = {
      'method' : 'post',
      'contentType': 'application/json',
      'payload' : JSON.stringify({
        'messages': [
          {"role": "system", "content": "You are an expert at interpreting academic rubrics. Analyze the provided PDF content and extract the key assessment criteria and guidelines."},
          {"role": "user", "content": "Here is the base64 encoded content of a PDF rubric. Please interpret it and provide a concise summary of the assessment criteria:\n\n" + rubricBase64}
        ],
        'max_tokens': 2000,
        'temperature': 0.3,
        'top_p': 0.9,
        'n': 1,
        'stream': false
      }),
      'muteHttpExceptions': true
    };
    
    try {
      var rubricResponse = UrlFetchApp.fetch(serverUrl + '/v1/chat/completions', rubricInterpretationOptions);
      var rubricResponseCode = rubricResponse.getResponseCode();
      
      if (rubricResponseCode === 200) {
        var rubricResult = JSON.parse(rubricResponse.getContentText());
        if (rubricResult.choices && rubricResult.choices.length > 0 && rubricResult.choices[0].message) {
          var interpretedRubric = rubricResult.choices[0].message.content.trim();
          
          // Now, use the interpreted rubric to assess the writing
          var assessmentOptions = {
            'method' : 'post',
            'contentType': 'application/json',
            'payload' : JSON.stringify({
              'messages': [
                {"role": "system", "content": "You are an Ivy League college professor that assesses academic writing. Use the following rubric to provide detailed feedback on argument, grammar, structure, content, and style:\n\n" + interpretedRubric},
                {"role": "user", "content": "Assess the following student writing:\n\n" + body}
              ],
              'max_tokens': 1000,
              'temperature': 0.7,
              'top_p': 0.9,
              'n': 1,
              'stream': false
            }),
            'muteHttpExceptions': true
          };
          
          var assessmentResponse = UrlFetchApp.fetch(serverUrl + '/v1/chat/completions', assessmentOptions);
          var assessmentResponseCode = assessmentResponse.getResponseCode();
          
          if (assessmentResponseCode === 200) {
            var assessmentResult = JSON.parse(assessmentResponse.getContentText());
            if (assessmentResult.choices && assessmentResult.choices.length > 0 && assessmentResult.choices[0].message) {
              var assessment = assessmentResult.choices[0].message.content.trim();
              
              // Create a new document for the assessment
              var newDoc = DocumentApp.create('Writing Assessment - ' + new Date().toLocaleString());
              newDoc.getBody().appendParagraph(assessment);
              
              // Provide a link to the new document
              var url = newDoc.getUrl();
              var linkText = 'View it here';
              var paragraph = doc.getBody().appendParagraph('\n\nAssessment completed. ');
              paragraph.appendText(linkText).setLinkUrl(url);
              
              ui.alert('Assessment Complete', 'The assessment has been created in a new document. A link has been added to the end of your current document.', ui.ButtonSet.OK);
            } else {
              ui.alert('Error', 'No assessment generated from the server.', ui.ButtonSet.OK);
            }
          } else {
            ui.alert('Error', 'Server returned status code ' + assessmentResponseCode + ' during assessment: ' + assessmentResponse.getContentText(), ui.ButtonSet.OK);
          }
        } else {
          ui.alert('Error', 'Failed to interpret the rubric.', ui.ButtonSet.OK);
        }
      } else {
        ui.alert('Error', 'Server returned status code ' + rubricResponseCode + ' during rubric interpretation: ' + rubricResponse.getContentText(), ui.ButtonSet.OK);
      }
    } catch (error) {
      ui.alert('Error', 'Failed to connect to LMS Studio server: ' + error, ui.ButtonSet.OK);
    }
  }
}
