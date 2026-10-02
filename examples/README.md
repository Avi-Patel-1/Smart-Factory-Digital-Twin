# Example outputs

`guided-run.json` is the versioned input record for the 60-second walkthrough in version 2.0.0. Import it through **Import run** to reconstruct the cell. The alarm, production, tag, OEE and Markdown report files in this directory were downloaded through **Production Report** at its endpoint.

`packaging_cell_historian.sqlite` and `sql_analysis_results.json` describe a separate three-hour synthetic Python fixture. Regenerate them explicitly with `npm run data:historian`; this replaces the sample database. SQLite binary bytes may differ by library version even when the rows match. These examples contain no physical measurements.
