# scripts/fetch_europepmc.py

import requests
import os

# --- Configuration ---
# Your unique Europe PMC query.
# Using ORCID is highly recommended for accuracy.
# Go to https://europepmc.org/advancesearch to build and test your query.
QUERY = '(AUTHOR_ID:"0000-0003-1289-6919")' # <-- IMPORTANT: REPLACE WITH YOUR QUERY
OUTPUT_BIB_FILE = '_bibliography/papers.bib'

# Europe PMC API endpoint
API_URL = "https://www.ebi.ac.uk/europepmc/webservices/rest/search"

# --- Helper function to format a single publication entry into BibTeX ---
def format_bibtex(entry):
    # Start with the basic entry type and citation key
    # The citation key can be improved (e.g., author-year-firstword)
    citation_key = entry.get('pmid', entry.get('doi', entry.get('id', 'unknown')))
    bibtex_entry = f"@article{{{citation_key},\n"

    # Add fields, checking if they exist
    if 'title' in entry:
        bibtex_entry += f"  title = {{{entry['title']}}},\n"
    if 'authorString' in entry:
        # Replace '.,' with ' and ' for better formatting
        authors = entry['authorString'].replace('.,', ' and').replace('.', '')
        bibtex_entry += f"  author = {{{authors}}},\n"
    if 'journalTitle' in entry:
        bibtex_entry += f"  journal = {{{entry['journalTitle']}}},\n"
    if 'pubYear' in entry:
        bibtex_entry += f"  year = {{{entry['pubYear']}}},\n"
    if 'journalVolume' in entry:
        bibtex_entry += f"  volume = {{{entry['journalVolume']}}},\n"
    if 'pageInfo' in entry:
        bibtex_entry += f"  pages = {{{entry['pageInfo']}}},\n"
    if 'doi' in entry:
        bibtex_entry += f"  doi = {{{entry['doi']}}},\n"
    if 'pmid' in entry:
        bibtex_entry += f"  pmid = {{{entry['pmid']}}},\n"

    # Close the entry
    bibtex_entry += "}\n"
    return bibtex_entry

# --- Main script execution ---
def main():
    print(f"Querying Europe PMC with: {QUERY}")

    params = {
        'query': QUERY,
        'format': 'json',
        'resultType': 'core',
        'pageSize': 1000  # Get up to 1000 results
    }

    try:
        response = requests.get(API_URL, params=params)
        response.raise_for_status()  # Raises an HTTPError for bad responses (4xx or 5xx)
        data = response.json()
        
        publications = data.get('resultList', {}).get('result', [])
        
        if not publications:
            print("No publications found for the given query.")
            return

        print(f"Found {len(publications)} publications. Generating BibTeX file...")

        # Create directory if it doesn't exist
        os.makedirs(os.path.dirname(OUTPUT_BIB_FILE), exist_ok=True)
        
        with open(OUTPUT_BIB_FILE, 'w', encoding='utf-8') as f:
            for entry in publications:
                bibtex_formatted = format_bibtex(entry)
                f.write(bibtex_formatted + "\n")

        print(f"Successfully generated {OUTPUT_BIB_FILE}")

    except requests.exceptions.RequestException as e:
        print(f"Error fetching data from Europe PMC API: {e}")
    except Exception as e:
        print(f"An unexpected error occurred: {e}")

if __name__ == "__main__":
    main()

