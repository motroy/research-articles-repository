document.addEventListener('DOMContentLoaded', () => {
    const publicationsList = document.getElementById('publicationsList');
    const exportBibButton = document.getElementById('exportBib');
    const exportCsvButton = document.getElementById('exportCsv');
    const exportMdButton = document.getElementById('exportMd');

    let bibtexData = ''; // To store the raw BibTeX content
    let parsedEntries = []; // To store parsed BibTeX entries

    // Fetches and processes the BibTeX file
    async function loadPublications() {
        try {
            const response = await fetch('_bibliography/papers.bib');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            bibtexData = await response.text();
            if (!bibtexData.trim()) {
                publicationsList.innerHTML = '<p>No publications found in _bibliography/papers.bib. It might be empty or not yet generated.</p>';
                disableExportButtons(true);
                return;
            }
            parsedEntries = parseBibTeX(bibtexData);
            displayPublications(parsedEntries);
            disableExportButtons(false);
        } catch (error) {
            console.error('Error loading or parsing BibTeX file:', error);
            publicationsList.innerHTML = `<p>Error loading publications: ${error.message}. Please check the console for more details.</p>`;
            disableExportButtons(true);
        }
    }

    function disableExportButtons(disable) {
        exportBibButton.disabled = disable;
        exportCsvButton.disabled = disable;
        exportMdButton.disabled = disable;
    }

    // Basic BibTeX Parser
    function parseBibTeX(bibtexString) {
        const entries = [];
        // Remove comments and split by entry
        const bibEntries = bibtexString.replace(/%.*\n/g, '').split(/@(?=\w+\s*\{)/);

        bibEntries.forEach(entryStr => {
            if (!entryStr.trim()) return;

            const entry = {};
            const firstBrace = entryStr.indexOf('{');
            const entryTypeMatch = entryStr.substring(0, firstBrace).trim().toLowerCase();
            entry.type = entryTypeMatch;

            const commaAfterKey = entryStr.indexOf(',', firstBrace);
            entry.key = entryStr.substring(firstBrace + 1, commaAfterKey).trim();

            const fieldsStr = entryStr.substring(commaAfterKey + 1, entryStr.lastIndexOf('}'));

            // Regex to match field = {value} or field = "value"
            // This is a simplified parser and might not handle all BibTeX complexities (e.g., nested braces, @string macros)
            const fieldRegex = /\s*(\w+)\s*=\s*[\{{"]?([^}"{]+)[\}}"}]?,?/g;
            let match;
            entry.fields = {};

            while ((match = fieldRegex.exec(fieldsStr)) !== null) {
                const key = match[1].trim().toLowerCase();
                let value = match[2].trim();
                // Basic cleanup: remove extra braces if they are the outer layer
                if (value.startsWith('{') && value.endsWith('}')) {
                    value = value.substring(1, value.length - 1);
                }
                entry.fields[key] = value.replace(/\s+/g, ' ').replace(/[\n\r]+/g, ' ');
            }
            entries.push(entry);
        });
        return entries;
    }

    // Displays publications on the page
    function displayPublications(entries) {
        if (!entries || entries.length === 0) {
            publicationsList.innerHTML = '<p>No publications to display.</p>';
            return;
        }

        let html = '<ul>';
        entries.forEach(entry => {
            html += '<li>';
            html += `<h3>${entry.fields.title || 'No Title'}</h3>`;
            html += `<p><strong>Authors:</strong> ${entry.fields.author || 'N/A'}</p>`;
            html += `<p><strong>Year:</strong> ${entry.fields.year || 'N/A'}</p>`;
            if (entry.fields.journal) {
                html += `<p><strong>Journal:</strong> ${entry.fields.journal}</p>`;
            }
            if (entry.fields.booktitle) {
                html += `<p><strong>Book Title:</strong> ${entry.fields.booktitle}</p>`;
            }
            if (entry.fields.howpublished || entry.fields.note) {
                 html += `<p><strong>Note:</strong> ${entry.fields.howpublished || entry.fields.note}</p>`;
            }
            html += `<p><em>Type: ${entry.type}, Key: ${entry.key}</em></p>`;
            html += '</li>';
        });
        html += '</ul>';
        publicationsList.innerHTML = html;
    }

    // Export functions
    function downloadFile(filename, content, mimeType) {
        const element = document.createElement('a');
        element.setAttribute('href', `data:${mimeType};charset=utf-8,` + encodeURIComponent(content));
        element.setAttribute('download', filename);
        element.style.display = 'none';
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
    }

    exportBibButton.addEventListener('click', () => {
        if (bibtexData) {
            downloadFile('publications.bib', bibtexData, 'application/x-bibtex');
        } else {
            alert('BibTeX data not loaded yet.');
        }
    });

    exportCsvButton.addEventListener('click', () => {
        if (parsedEntries.length === 0) {
            alert('No parsed publications to export.');
            return;
        }
        let csvContent = 'Type,Key,Title,Authors,Year,Journal/Booktitle,DOI,URL\n';
        parsedEntries.forEach(entry => {
            const type = entry.type || '';
            const key = entry.key || '';
            const title = entry.fields.title || '';
            const authors = entry.fields.author || '';
            const year = entry.fields.year || '';
            const journalOrBooktitle = entry.fields.journal || entry.fields.booktitle || '';
            const doi = entry.fields.doi || '';
            const url = entry.fields.url || entry.fields.eprint || '';

            // Basic CSV escaping (wrapping in quotes if it contains comma or quote)
            const escapeCsv = (val) => {
                let str = String(val).replace(/"/g, '""'); // escape double quotes
                if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                    str = `"${str}"`;
                }
                return str;
            };

            csvContent += `${escapeCsv(type)},${escapeCsv(key)},${escapeCsv(title)},${escapeCsv(authors)},${escapeCsv(year)},${escapeCsv(journalOrBooktitle)},${escapeCsv(doi)},${escapeCsv(url)}\n`;
        });
        downloadFile('publications.csv', csvContent, 'text/csv');
    });

    exportMdButton.addEventListener('click', () => {
        if (parsedEntries.length === 0) {
            alert('No parsed publications to export.');
            return;
        }
        let mdContent = '# Publications\n\n';
        parsedEntries.forEach(entry => {
            mdContent += `## ${entry.fields.title || 'No Title'}\n\n`;
            mdContent += `- **Authors:** ${entry.fields.author || 'N/A'}\n`;
            mdContent += `- **Year:** ${entry.fields.year || 'N/A'}\n`;
            if (entry.fields.journal) {
                mdContent += `- **Journal:** ${entry.fields.journal}\n`;
            }
            if (entry.fields.booktitle) {
                mdContent += `- **Book Title:** ${entry.fields.booktitle}\n`;
            }
            if (entry.fields.doi) {
                mdContent += `- **DOI:** [${entry.fields.doi}](https://doi.org/${entry.fields.doi})\n`;
            }
            if (entry.fields.url) {
                mdContent += `- **URL:** [${entry.fields.url}](${entry.fields.url})\n`;
            }
             if (entry.fields.eprint) {
                mdContent += `- **ePrint:** [${entry.fields.eprint}](${entry.fields.eprint})\n`;
            }
            mdContent += `- *BibTeX Key: ${entry.key} (${entry.type})*\n\n`;
            mdContent += '---\n\n';
        });
        downloadFile('publications.md', mdContent, 'text/markdown');
    });

    // Initial load
    loadPublications();
});
