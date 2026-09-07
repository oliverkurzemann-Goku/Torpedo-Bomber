#!/usr/bin/env python3
# ============================================================
#  overture_lib.py -- shared helpers for the real-data Overture Maps tools
#  (fetch_overture.py). Overture's public S3 bucket holds each theme/type as
#  a HANDFUL of ~400-700MB Parquet files covering the ENTIRE PLANET -- with
#  no httpfs-style range-read extension available in this environment (see
#  the session's own connectivity notes: extensions.duckdb.org is blocked),
#  downloading any one of those whole is both slow and pointless for a
#  ~30x30km working area. Overture's own GeoParquet schema carries a `bbox`
#  struct column (xmin/xmax/ymin/ymax, WGS84 degrees) specifically so a
#  reader can skip irrelevant ROW GROUPS using the file's own Parquet
#  column statistics -- confirmed directly against a real file before
#  writing this module (see the session's own verification: a footer-only
#  open of a 400MB+ file completed in under a second via fsspec's HTTP
#  range-read support, well before any row-group body was fetched).
# ============================================================

import io
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import quote
from urllib.request import urlopen

import fsspec
import pyarrow.parquet as pq
from shapely import wkb as shapely_wkb
from shapely.geometry import box as shapely_box

_HTTP_FS = fsspec.filesystem("https")


def list_keys(bucket, prefix):
    """Full (paginated) listing of an S3 bucket's keys under `prefix`, via
    the plain public XML ListObjectsV2 API -- no AWS SDK/credentials needed
    for a public bucket."""
    base = f"https://{bucket}.s3.amazonaws.com/"
    keys = []
    token = None
    ns = {"s3": "http://s3.amazonaws.com/doc/2006-03-01/"}
    while True:
        url = base + f"?list-type=2&prefix={quote(prefix)}&max-keys=1000"
        if token:
            url += f"&continuation-token={quote(token)}"
        with urlopen(url, timeout=30) as r:
            data = r.read()
        root = ET.fromstring(data)
        for c in root.findall("s3:Contents", ns):
            keys.append(c.find("s3:Key", ns).text)
        trunc = root.find("s3:IsTruncated", ns).text
        if trunc == "true":
            token = root.find("s3:NextContinuationToken", ns).text
        else:
            break
    return keys


def _row_group_bbox(rg, schema_names):
    """Extracts (xmin,ymin,xmax,ymax) from one row group's own column
    statistics for the bbox.xmin/xmax/ymin/ymax leaf columns, or None if
    any of the four is missing/has no min-max (rare, e.g. an all-null row
    group)."""
    idx = {}
    for i in range(rg.num_columns):
        col = rg.column(i)
        path = ".".join(col.path_in_schema) if isinstance(col.path_in_schema, (list, tuple)) else col.path_in_schema
        idx[path] = col
    try:
        xmin = idx["bbox.xmin"].statistics.min
        xmax = idx["bbox.xmax"].statistics.max
        ymin = idx["bbox.ymin"].statistics.min
        ymax = idx["bbox.ymax"].statistics.max
    except (KeyError, AttributeError):
        return None
    return (xmin, ymin, xmax, ymax)


def find_matching_row_groups(url, bbox):
    """Opens one Parquet file's FOOTER ONLY (a small range read) and returns
    the list of row-group indices whose own bbox stats overlap `bbox`
    (xmin,ymin,xmax,ymax). Returns [] (not an error) for a file with no
    overlap, or one whose row groups lack bbox stats entirely (shouldn't
    happen for Overture's schema, but degrading to \"check nothing\" is
    safer than accidentally skipping a real file some other way)."""
    bxmin, bymin, bxmax, bymax = bbox
    with _HTTP_FS.open(url, "rb") as f:
        pf = pq.ParquetFile(f)
        matches = []
        for i in range(pf.metadata.num_row_groups):
            rg = pf.metadata.row_group(i)
            b = _row_group_bbox(rg, pf.schema_arrow.names)
            if b is None:
                continue
            xmin, ymin, xmax, ymax = b
            if xmin <= bxmax and xmax >= bxmin and ymin <= bymax and ymax >= bymin:
                matches.append(i)
        return matches


def scan_theme(bucket, prefix, bbox, max_workers=16):
    """Lists every part file under `prefix`, and in parallel finds which
    row groups (if any) overlap `bbox`. Returns [(url, [row_group_idx,...]), ...]
    for files that have at least one match -- most files, for a bbox this
    small against a planet-wide dataset, will have none and are dropped
    here already."""
    keys = list_keys(bucket, prefix)
    base = f"https://{bucket}.s3.amazonaws.com/"
    results = []
    with ThreadPoolExecutor(max_workers=max_workers) as ex:
        futs = {ex.submit(find_matching_row_groups, base + k, bbox): (base + k) for k in keys}
        for fut in as_completed(futs):
            url = futs[fut]
            try:
                rgs = fut.result()
            except Exception as e:
                print(f"  WARN: footer read failed for {url}: {e}")
                continue
            if rgs:
                results.append((url, rgs))
    return results, len(keys)


def read_matching_rows(url, row_group_indices):
    """Reads ONLY the given row groups of one Parquet file (each one a
    targeted set of range reads driven by that row group's own byte
    offsets in the footer, not the whole file) and returns a pyarrow
    Table."""
    with _HTTP_FS.open(url, "rb") as f:
        pf = pq.ParquetFile(f)
        return pf.read_row_groups(row_group_indices)


def collect_theme_rows(bucket, prefix, bbox, max_workers=16, read_workers=8):
    """scan_theme() + read_matching_rows() for every matched file, run in
    parallel, concatenated into one pyarrow Table (or None if nothing
    matched at all)."""
    import pyarrow as pa

    matches, total_files = scan_theme(bucket, prefix, bbox, max_workers=max_workers)
    print(f"  {prefix}: {len(matches)}/{total_files} files have a matching row group")
    if not matches:
        return None
    tables = []
    with ThreadPoolExecutor(max_workers=read_workers) as ex:
        futs = {ex.submit(read_matching_rows, url, rgs): url for url, rgs in matches}
        for fut in as_completed(futs):
            url = futs[fut]
            try:
                tables.append(fut.result())
            except Exception as e:
                print(f"  WARN: row-group read failed for {url}: {e}")
    if not tables:
        return None
    table = pa.concat_tables(tables, promote_options="permissive")
    print(f"  {prefix}: {table.num_rows} candidate rows read (row-group bbox match, pre exact-geometry filter)")
    return table


def wkb_to_shape(wkb_bytes):
    return shapely_wkb.loads(wkb_bytes)


def bbox_polygon(bbox):
    xmin, ymin, xmax, ymax = bbox
    return shapely_box(xmin, ymin, xmax, ymax)
