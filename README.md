# Writing Assessment Tool

A Google Apps Script tool for assessing writing assignments based on a provided rubric.
Ulysses Cabayao, SJ 2024

## Table of Contents
- [Overview](#overview)
- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

## Overview
This tool allows teachers to assess writing assignments based on a provided rubric. The tool uses Google Apps Script to interact with Google Drive and Docs.

## Features
- Upload a rubric from Google Drive or a local file
- Assess writing assignments based on the uploaded rubric
- Provide detailed feedback on argument, grammar, structure, content, and style
- Create a new document for the assessment

## Installation
To install the tool, follow these steps:
1. Create a new Google Apps Script project.
2. Copy the code from this repository into your project.
3. Save the project.
4. Create a new menu item in your Google Doc by clicking on "Tools" > "Script editor".
5. In the script editor, click on "Run" > "onOpen".
6. The tool will create a new menu item called "Writing Assessment".

## Usage
To use the tool, follow these steps:
1. Open a Google Doc that contains the writing assignment.
2. Click on the "Writing Assessment" menu item.
3. Select "Upload Rubric" to upload a rubric from Google Drive or a local file.
4. Select "Assess Writing" to assess the writing assignment based on the uploaded rubric.
5. Enter the LMS Studio server URL when prompted.
6. The tool will create a new document for the assessment and provide a link to it.

## Troubleshooting
If you encounter any errors, check the following:
- Make sure you have uploaded a valid rubric.
- Make sure you have entered the correct LMS Studio server URL.
- Check the error messages in the script editor for more information.

## Contributing
If you would like to contribute to this project, please fork the repository and submit a pull request.

## License
This project is licensed under the MIT License. See the LICENSE file for more information.
