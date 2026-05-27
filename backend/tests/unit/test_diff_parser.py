from app.services.review.diff_parser import parse_pr_files, SKIP_EXTENSIONS


SAMPLE_PATCH = """\
@@ -1,5 +1,7 @@
 def login(user, password):
-    return db.query(f"SELECT * FROM users WHERE name='{user}'")
+    query = "SELECT * FROM users WHERE name = %s"
+    return db.execute(query, (user,))
+

 def logout():
     session.clear()
"""

SAMPLE_PR_FILES = [
    {
        "filename": "auth/login.py",
        "patch": SAMPLE_PATCH,
        "status": "modified",
        "additions": 2,
        "deletions": 1,
    },
    {
        "filename": "README.md",
        "patch": "@@ -1 +1 @@\n-old\n+new",
        "status": "modified",
        "additions": 1,
        "deletions": 1,
    },
    {
        "filename": "app.py",
        "patch": None,
        "status": "removed",
        "additions": 0,
        "deletions": 10,
    },
]


def test_parse_skips_removed_files():
    diffs = parse_pr_files(SAMPLE_PR_FILES)
    filenames = [d.filename for d in diffs]
    assert "app.py" not in filenames


def test_parse_marks_md_as_non_code():
    diffs = parse_pr_files(SAMPLE_PR_FILES)
    readme = next(d for d in diffs if d.filename == "README.md")
    assert not readme.is_code_file
    assert readme.hunks == []


def test_parse_extracts_hunks():
    diffs = parse_pr_files(SAMPLE_PR_FILES)
    login = next(d for d in diffs if d.filename == "auth/login.py")
    assert login.is_code_file
    assert len(login.hunks) == 1
    hunk = login.hunks[0]
    assert len(hunk.added_lines) >= 1
    assert any("execute" in line for line in hunk.added_lines)


def test_diff_position_is_positive():
    diffs = parse_pr_files(SAMPLE_PR_FILES)
    for d in diffs:
        for h in d.hunks:
            assert h.diff_position > 0


def test_skip_extensions_coverage():
    assert ".md" in SKIP_EXTENSIONS
    assert ".lock" in SKIP_EXTENSIONS
    assert ".py" not in SKIP_EXTENSIONS
