import bibtexparser
from bibtexparser.bparser import BibTexParser
from collections import Counter
import matplotlib.pyplot as plt
import os

BIB_FILE_PATH = '_bibliography/papers.bib'
OUTPUT_DIR = 'static'
OUTPUT_IMAGE_PATH = os.path.join(OUTPUT_DIR, 'publications_per_year.png')

def generate_plot():
    """
    Generates a bar chart of publications per year from a BibTeX file
    and saves it as a PNG image.
    """
    try:
        with open(BIB_FILE_PATH, 'r', encoding='utf-8') as bibtex_file:
            bibtex_str = bibtex_file.read()
    except FileNotFoundError:
        print(f"Error: BibTeX file not found at {BIB_FILE_PATH}")
        # Create an empty plot or a placeholder if the bib file isn't found
        fig, ax = plt.subplots()
        ax.text(0.5, 0.5, 'No publication data found to generate plot.',
                horizontalalignment='center', verticalalignment='center',
                transform=ax.transAxes, fontsize=12, color='red')
        ax.set_axis_off() # Hide axes for placeholder text
        # Ensure output directory exists
        os.makedirs(OUTPUT_DIR, exist_ok=True)
        plt.savefig(OUTPUT_IMAGE_PATH)
        print(f"Generated a placeholder plot image at {OUTPUT_IMAGE_PATH} due to missing BibTeX file.")
        return

    if not bibtex_str.strip():
        print(f"Warning: BibTeX file {BIB_FILE_PATH} is empty.")
        fig, ax = plt.subplots()
        ax.text(0.5, 0.5, 'Publication data is empty.',
                horizontalalignment='center', verticalalignment='center',
                transform=ax.transAxes, fontsize=12, color='orange')
        ax.set_axis_off()
        os.makedirs(OUTPUT_DIR, exist_ok=True)
        plt.savefig(OUTPUT_IMAGE_PATH)
        print(f"Generated a placeholder plot image at {OUTPUT_IMAGE_PATH} due to empty BibTeX file.")
        return

    parser = BibTexParser(common_strings=True)
    parser.ignore_nonstandard_types = False # Attempt to parse all entries
    parser.homogenize_fields = True # Converts month field to a standard numeric format if possible

    try:
        bib_database = bibtexparser.loads(bibtex_str, parser=parser)
    except Exception as e:
        print(f"Error parsing BibTeX file: {e}")
        # Create an error plot
        fig, ax = plt.subplots()
        ax.text(0.5, 0.5, f'Error parsing BibTeX file:\n{e}',
                horizontalalignment='center', verticalalignment='center',
                transform=ax.transAxes, fontsize=10, color='red', wrap=True)
        ax.set_axis_off()
        os.makedirs(OUTPUT_DIR, exist_ok=True)
        plt.savefig(OUTPUT_IMAGE_PATH)
        print(f"Generated an error plot image at {OUTPUT_IMAGE_PATH}.")
        return

    if not bib_database.entries:
        print("No entries found in the BibTeX database.")
        fig, ax = plt.subplots()
        ax.text(0.5, 0.5, 'No valid BibTeX entries found.',
                horizontalalignment='center', verticalalignment='center',
                transform=ax.transAxes, fontsize=12, color='orange')
        ax.set_axis_off()
        os.makedirs(OUTPUT_DIR, exist_ok=True)
        plt.savefig(OUTPUT_IMAGE_PATH)
        print(f"Generated a placeholder plot image at {OUTPUT_IMAGE_PATH} due to no valid entries.")
        return

    years = []
    for entry in bib_database.entries:
        year = entry.get('year')
        if year:
            # Ensure year is a string and try to convert to int
            try:
                years.append(int(str(year).strip()))
            except ValueError:
                print(f"Warning: Could not parse year '{year}' for entry '{entry.get('ID', 'Unknown ID')}'. Skipping.")
        else:
            print(f"Warning: Entry '{entry.get('ID', 'Unknown ID')}' has no year field. Skipping.")

    if not years:
        print("No valid publication years found to plot.")
        fig, ax = plt.subplots()
        ax.text(0.5, 0.5, 'No valid publication years found.',
                horizontalalignment='center', verticalalignment='center',
                transform=ax.transAxes, fontsize=12, color='orange')
        ax.set_axis_off()
        os.makedirs(OUTPUT_DIR, exist_ok=True)
        plt.savefig(OUTPUT_IMAGE_PATH)
        print(f"Generated a placeholder plot image at {OUTPUT_IMAGE_PATH} due to no valid years.")
        return

    year_counts = Counter(years)
    sorted_years = sorted(year_counts.keys())
    counts = [year_counts[year] for year in sorted_years]

    plt.figure(figsize=(10, 6))
    plt.bar(sorted_years, counts, color='skyblue')
    plt.xlabel("Year")
    plt.ylabel("Number of Publications")
    plt.title("Publications per Year")
    plt.xticks(sorted_years, rotation=45) # Ensure all years are displayed as ticks
    plt.gca().yaxis.set_major_locator(plt.MaxNLocator(integer=True)) # Ensure y-axis has integer ticks
    plt.tight_layout()

    # Ensure output directory exists
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    plt.savefig(OUTPUT_IMAGE_PATH)
    print(f"Plot saved to {OUTPUT_IMAGE_PATH}")

if __name__ == '__main__':
    generate_plot()
