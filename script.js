document.addEventListener('DOMContentLoaded', () => {
    const publicationsList = document.getElementById('publicationsList');
    const exportBibButton = document.getElementById('exportBib');
    const exportCsvButton = document.getElementById('exportCsv');
    const exportMdButton = document.getElementById('exportMd');
    const sortOptionsElement = document.getElementById('sortOptions');
    const filterStartDateElement = document.getElementById('filterStartDate');
    const filterEndDateElement = document.getElementById('filterEndDate');
    const applyFilterButton = document.getElementById('applyFilterButton');
    const clearFilterButton = document.getElementById('clearFilterButton');

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
            applyFiltersAndSort(); // Initial filter and sort
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

    // --- Sorting Functions ---
    function getFirstAuthorLastName(entry) {
        const authorField = entry.fields.author;
        // Return 'zzzz' (to sort last) if author field is missing, not a string, or empty after trimming
        if (!authorField || typeof authorField !== 'string' || !authorField.trim()) {
            return 'zzzz';
        }

        // Get the string representing the first author.
        // Given the format in papers.bib (e.g., "Landman D, Cherniak M, ..."),
        // the first author's full name part is everything before the first comma.
        let firstAuthorString = authorField.split(',')[0].trim();

        // From this string (e.g., "Landman D" or "Strahilevitz"), the last name is the first word.
        const nameParts = firstAuthorString.split(' ');
        let lastName = nameParts[0].trim(); // Takes the first part, e.g. "Landman" from "Landman D"

        // Handle cases where firstAuthorString might be just "Lastname" (no space, so split(' ') gives one part)
        // or if somehow nameParts[0] was empty or just whitespace.
        // If lastName is empty at this point but firstAuthorString was not, use firstAuthorString itself.
        // This covers single-word names like "Plato" correctly if firstAuthorString was "Plato".
        if (!lastName && firstAuthorString) {
            lastName = firstAuthorString;
        }
        // If after all this, lastName is still undefined or empty (e.g. authorField was just spaces or odd format)
        // return 'zzzz' to sort it last.
        return lastName ? lastName.toLowerCase() : 'zzzz';
    }

    function sortPublications(entries, sortBy) {
        let sortedEntries = [...entries]; // Create a copy to sort
        switch (sortBy) {
            case 'year_newest':
                sortedEntries.sort((a, b) => (b.fields.year || 0) - (a.fields.year || 0));
                break;
            case 'year_oldest':
                sortedEntries.sort((a, b) => (a.fields.year || Infinity) - (b.fields.year || Infinity));
                break;
            case 'author_az':
                sortedEntries.sort((a, b) => {
                    const authorA = getFirstAuthorLastName(a);
                    const authorB = getFirstAuthorLastName(b);
                    return authorA.localeCompare(authorB);
                });
                break;
        }
        return sortedEntries;
    }

    // Displays publications on the page
    function displayPublications(entriesToDisplay) {
        if (!entriesToDisplay || entriesToDisplay.length === 0) {
            publicationsList.innerHTML = '<p>No publications to display.</p>';
            return;
        }

        let html = '<ul>';
        entriesToDisplay.forEach(entry => {
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
            if (entry.fields.url) {
                html += `<p><strong>URL:</strong> <a href="${entry.fields.url}" target="_blank">${entry.fields.url}</a></p>`;
            }
            if (entry.fields.citations) {
                html += `<p><strong>Citations:</strong> ${entry.fields.citations}</p>`;
            }
            html += `<p><em>Type: ${entry.type}, Key: ${entry.key}</em></p>`;
            html += '</li>';
        });
        html += '</ul>';
        publicationsList.innerHTML = html;
    }

    function sortAndDisplayPublications() {
        const sortBy = sortOptionsElement.value;
        const sortedEntries = sortPublications(parsedEntries, sortBy);
        displayPublications(sortedEntries);
    }

    // --- Filtering Logic ---
    function filterPublications(entries) {
        const startDate = filterStartDateElement.value ? parseInt(filterStartDateElement.value) : null;
        const endDate = filterEndDateElement.value ? parseInt(filterEndDateElement.value) : null;

        if (!startDate && !endDate) {
            return entries; // No filter applied
        }

        return entries.filter(entry => {
            const year = parseInt(entry.fields.year);
            if (isNaN(year)) return false; // Skip entries without a valid year

            const meetsStartDate = startDate ? year >= startDate : true;
            const meetsEndDate = endDate ? year <= endDate : true;

            return meetsStartDate && meetsEndDate;
        });
    }

    function applyFiltersAndSort() {
        const filteredEntries = filterPublications(parsedEntries);
        const sortBy = sortOptionsElement.value;
        const sortedAndFilteredEntries = sortPublications(filteredEntries, sortBy);
        displayPublications(sortedAndFilteredEntries);
        // generatePublicationsPerYearPlot(parsedEntries); // Removed call to JS plot generation
    }

    // Event listeners
    sortOptionsElement.addEventListener('change', applyFiltersAndSort);
    applyFilterButton.addEventListener('click', applyFiltersAndSort);
    clearFilterButton.addEventListener('click', () => {
        filterStartDateElement.value = '';
        filterEndDateElement.value = '';
        applyFiltersAndSort(); // Re-apply (which now means no date filter) and sort
    });


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

    // --- Charting Logic ---
    // The generatePublicationsPerYearPlot function has been removed as plotting is now handled by a Python script.

    // Initial load
    loadPublications();
});
