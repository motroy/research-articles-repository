document.addEventListener('DOMContentLoaded', () => {
    const publicationsList = document.getElementById('publicationsList');
    const exportBibButton = document.getElementById('exportBib');
    const exportCsvButton = document.getElementById('exportCsv');
    const exportMdButton = document.getElementById('exportMd');
    const sortOptionsElement = document.getElementById('sortOptions');
    const filterStartDateElement = document.getElementById('filterStartDate');
    const filterEndDateElement = document.getElementById('filterEndDate');
    const clearFilterButton = document.getElementById('clearFilterButton');
    const searchInput = document.getElementById('searchInput');
    const clearSearchButton = document.getElementById('clearSearch');
    const filterJournalElement = document.getElementById('filterJournal');
    const resultsCountElement = document.getElementById('resultsCount');

    let bibtexData = '';
    let parsedEntries = [];
    let searchDebounceTimer = null;

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
            populateJournalFilter();
            applyFiltersAndSort();
            disableExportButtons(false);
        } catch (error) {
            console.error('Error loading or parsing BibTeX file:', error);
            publicationsList.innerHTML = `<div class="no-results"><p class="no-results-title">Error loading publications</p><p>${error.message}</p></div>`;
            disableExportButtons(true);
        }
    }

    function disableExportButtons(disable) {
        exportBibButton.disabled = disable;
        exportCsvButton.disabled = disable;
        exportMdButton.disabled = disable;
    }

    // Populate journal filter dropdown from data
    function populateJournalFilter() {
        const journals = new Set();
        parsedEntries.forEach(entry => {
            const journal = entry.fields.journal;
            if (journal && journal.trim()) {
                journals.add(journal.trim());
            }
        });
        const sorted = Array.from(journals).sort((a, b) => a.localeCompare(b));
        sorted.forEach(journal => {
            const option = document.createElement('option');
            option.value = journal;
            option.textContent = journal;
            filterJournalElement.appendChild(option);
        });
    }

    // Basic BibTeX Parser
    function parseBibTeX(bibtexString) {
        const entries = [];
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

            const fieldRegex = /\s*(\w+)\s*=\s*[\{{"]?([^}"{]+)[\}}"}]?,?/g;
            let match;
            entry.fields = {};

            while ((match = fieldRegex.exec(fieldsStr)) !== null) {
                const key = match[1].trim().toLowerCase();
                let value = match[2].trim();
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
        if (!authorField || typeof authorField !== 'string' || !authorField.trim()) {
            return 'zzzz';
        }

        let firstAuthorString = authorField.split(',')[0].trim();
        const nameParts = firstAuthorString.split(' ');
        let lastName = nameParts[0].trim();

        if (!lastName && firstAuthorString) {
            lastName = firstAuthorString;
        }
        return lastName ? lastName.toLowerCase() : 'zzzz';
    }

    function sortPublications(entries, sortBy) {
        let sortedEntries = [...entries];
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
            case 'citations_desc':
                sortedEntries.sort((a, b) => {
                    const citA = parseInt(a.fields.citations) || 0;
                    const citB = parseInt(b.fields.citations) || 0;
                    return citB - citA;
                });
                break;
        }
        return sortedEntries;
    }

    // --- Search Functions ---
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function highlightText(text, query) {
        if (!query) return escapeHtml(text);
        const escaped = escapeHtml(text);
        const terms = query.trim().split(/\s+/).filter(t => t.length > 0);
        let result = escaped;
        terms.forEach(term => {
            const regex = new RegExp('(' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
            result = result.replace(regex, '<mark>$1</mark>');
        });
        return result;
    }

    function searchPublications(entries, query) {
        if (!query || !query.trim()) return entries;
        const terms = query.toLowerCase().trim().split(/\s+/).filter(t => t.length > 0);

        return entries.filter(entry => {
            const searchable = [
                entry.fields.title || '',
                entry.fields.author || '',
                entry.fields.journal || '',
                entry.fields.booktitle || '',
                entry.fields.doi || '',
                entry.fields.year || '',
                entry.key || ''
            ].join(' ').toLowerCase();

            return terms.every(term => searchable.includes(term));
        });
    }

    // --- Filtering Logic ---
    function filterPublications(entries) {
        const startDate = filterStartDateElement.value ? parseInt(filterStartDateElement.value) : null;
        const endDate = filterEndDateElement.value ? parseInt(filterEndDateElement.value) : null;
        const selectedJournal = filterJournalElement.value;

        let filtered = entries;

        // Year range filter
        if (startDate || endDate) {
            filtered = filtered.filter(entry => {
                const year = parseInt(entry.fields.year);
                if (isNaN(year)) return false;
                const meetsStartDate = startDate ? year >= startDate : true;
                const meetsEndDate = endDate ? year <= endDate : true;
                return meetsStartDate && meetsEndDate;
            });
        }

        // Journal filter
        if (selectedJournal) {
            filtered = filtered.filter(entry => {
                return entry.fields.journal && entry.fields.journal.trim() === selectedJournal;
            });
        }

        return filtered;
    }

    function applyFiltersAndSort() {
        const query = searchInput.value;
        let results = filterPublications(parsedEntries);
        results = searchPublications(results, query);
        const sortBy = sortOptionsElement.value;
        results = sortPublications(results, sortBy);
        displayPublications(results, query);
        updateResultsCount(results.length, parsedEntries.length);
    }

    function updateResultsCount(shown, total) {
        if (shown === total) {
            resultsCountElement.textContent = `${total} publication${total !== 1 ? 's' : ''}`;
        } else {
            resultsCountElement.textContent = `${shown} of ${total} publication${total !== 1 ? 's' : ''}`;
        }
    }

    // Displays publications on the page
    function displayPublications(entriesToDisplay, searchQuery) {
        if (!entriesToDisplay || entriesToDisplay.length === 0) {
            const query = searchQuery || searchInput.value;
            let msg = '<div class="no-results">';
            msg += '<p class="no-results-title">No publications found</p>';
            if (query) {
                msg += `<p>No results match "${escapeHtml(query)}"</p>`;
            }
            msg += '<p>Try adjusting your search or filters.</p>';
            msg += '</div>';
            publicationsList.innerHTML = msg;
            return;
        }

        const query = searchQuery || '';
        const externalLinkIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';

        let html = '<ul>';
        entriesToDisplay.forEach(entry => {
            html += '<li>';

            // Title - link to URL if available
            const titleText = entry.fields.title || 'No Title';
            if (entry.fields.url) {
                html += `<h3><a href="${escapeHtml(entry.fields.url)}" target="_blank" rel="noopener">${highlightText(titleText, query)}</a></h3>`;
            } else {
                html += `<h3>${highlightText(titleText, query)}</h3>`;
            }

            // Authors
            if (entry.fields.author) {
                html += `<p class="pub-authors">${highlightText(entry.fields.author, query)}</p>`;
            }

            // Metadata tags
            html += '<div class="pub-meta">';
            if (entry.fields.year) {
                html += `<span class="tag tag-year">${escapeHtml(entry.fields.year)}</span>`;
            }
            if (entry.fields.journal) {
                html += `<span class="tag tag-journal">${highlightText(entry.fields.journal, query)}</span>`;
            } else if (entry.fields.booktitle) {
                html += `<span class="tag tag-journal">${highlightText(entry.fields.booktitle, query)}</span>`;
            }
            if (entry.fields.citations) {
                const citCount = parseInt(entry.fields.citations);
                if (citCount > 0) {
                    html += `<span class="tag tag-citations">${citCount} citation${citCount !== 1 ? 's' : ''}</span>`;
                }
            }
            if (entry.type) {
                html += `<span class="tag">${escapeHtml(entry.type)}</span>`;
            }
            html += '</div>';

            // External link
            if (entry.fields.url) {
                html += `<a href="${escapeHtml(entry.fields.url)}" target="_blank" rel="noopener" class="pub-link">${externalLinkIcon} View publication</a>`;
            }

            html += '</li>';
        });
        html += '</ul>';
        publicationsList.innerHTML = html;
    }

    // --- Event Listeners ---

    // Real-time search with debounce
    searchInput.addEventListener('input', () => {
        clearSearchButton.style.display = searchInput.value ? 'block' : 'none';
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(applyFiltersAndSort, 200);
    });

    clearSearchButton.addEventListener('click', () => {
        searchInput.value = '';
        clearSearchButton.style.display = 'none';
        applyFiltersAndSort();
        searchInput.focus();
    });

    // Sort and filter controls - apply immediately on change
    sortOptionsElement.addEventListener('change', applyFiltersAndSort);
    filterJournalElement.addEventListener('change', applyFiltersAndSort);
    filterStartDateElement.addEventListener('input', () => {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(applyFiltersAndSort, 400);
    });
    filterEndDateElement.addEventListener('input', () => {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(applyFiltersAndSort, 400);
    });

    clearFilterButton.addEventListener('click', () => {
        searchInput.value = '';
        clearSearchButton.style.display = 'none';
        filterStartDateElement.value = '';
        filterEndDateElement.value = '';
        filterJournalElement.value = '';
        applyFiltersAndSort();
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

            const escapeCsv = (val) => {
                let str = String(val).replace(/"/g, '""');
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
