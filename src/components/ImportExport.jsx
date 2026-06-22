import {
  exportPartsCsv,
  exportWorkTypesCsv,
  exportListsJson,
  importPartsCsv,
  importWorkTypesCsv,
  importListsJson,
} from '../lib/listImport.js';
import { shareFile } from '../lib/share.js';
import { useToast } from './Toast.jsx';
import Icon from './Icon.jsx';

function summarize(label, r) {
  if (r.parts || r.workTypes) {
    const skipped = (r.parts?.skipped || 0) + (r.workTypes?.skipped || 0);
    return `Imported ${r.parts?.added || 0} parts, ${r.workTypes?.added || 0} work types${skipped ? ` (skipped ${skipped})` : ''}`;
  }
  return `${label}: added ${r.added}${r.skipped ? `, skipped ${r.skipped}` : ''}`;
}

// Bulk import/export for the parts catalog and work types (incl. their templates).
export default function ImportExport() {
  const toast = useToast();

  async function doExport(fn, name, title) {
    try {
      const blob = await fn();
      const res = await shareFile(blob, name, { title });
      toast(res === 'downloaded' ? `${title} downloaded` : `${title} ready to save`);
    } catch {
      toast('Export failed');
    }
  }

  async function onFile(e, importer, label) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      toast(summarize(label, await importer(text)));
    } catch (err) {
      toast(err.message || 'Import failed');
    }
  }

  const Row = ({ title, onExport, accept, importer, label, testid }) => (
    <>
      <div className="section-title" style={{ marginTop: 12 }}>{title}</div>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn btn--ghost btn--sm" onClick={onExport}>
          <Icon name="download" size={16} /> Export
        </button>
        <label className="btn btn--ghost btn--sm" style={{ margin: 0 }}>
          <Icon name="upload" size={16} /> Import
          <input type="file" accept={accept} data-testid={testid} hidden onChange={(e) => onFile(e, importer, label)} />
        </label>
      </div>
    </>
  );

  return (
    <div className="card">
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
        Bulk-add parts and work types from a file. Importing <strong>adds new items and skips any
        name that already exists</strong>. Export gives you a correctly-formatted file you can edit
        in a spreadsheet and re-import.
      </p>

      <Row
        title="Parts (CSV)"
        onExport={() => doExport(exportPartsCsv, 'parts.csv', 'Parts CSV')}
        accept=".csv,text/csv"
        importer={importPartsCsv}
        label="Parts"
        testid="import-parts"
      />
      <Row
        title="Work types + templates (CSV)"
        onExport={() => doExport(exportWorkTypesCsv, 'work-types.csv', 'Work types CSV')}
        accept=".csv,text/csv"
        importer={importWorkTypesCsv}
        label="Work types"
        testid="import-worktypes"
      />
      <Row
        title="All lists (JSON)"
        onExport={() => doExport(exportListsJson, 'field-service-lists.json', 'Lists JSON')}
        accept=".json,application/json"
        importer={importListsJson}
        label="Lists"
        testid="import-lists-json"
      />
    </div>
  );
}
