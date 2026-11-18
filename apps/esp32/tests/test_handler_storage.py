import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src", "ble"))

from handler_storage import _MAX_PAYLOAD, StorageHandler, build_payload  # noqa: E402


class BuildPayloadTest(unittest.TestCase):
    def test_carries_the_title_beside_the_book_hash(self):
        data = json.loads(build_payload(10, 20, "57569a1c", "Pride and Prejudice"))
        self.assertEqual(
            data,
            {"free_bytes": 10, "total_bytes": 20, "book_hash": "57569a1c", "title": "Pride and Prejudice"},
        )

    def test_omits_the_title_when_the_book_has_none(self):
        data = json.loads(build_payload(10, 20, "57569a1c", ""))
        self.assertNotIn("title", data)
        self.assertEqual(data["book_hash"], "57569a1c")

    def test_shortens_a_long_title_to_fit_one_read(self):
        title = 'A "quoted" title ' * 60
        encoded = build_payload(13692928, 14680064, "57569a1c", title)
        self.assertLessEqual(len(encoded), _MAX_PAYLOAD)
        data = json.loads(encoded)
        self.assertTrue(title.startswith(data["title"]))
        self.assertGreater(len(data["title"]), 250)


class FakeBle:
    def __init__(self):
        self.value = b""

    def gatts_write(self, handle, data):
        self.value = data


class StorageHandlerTest(unittest.TestCase):
    def setUp(self):
        self._cwd = os.getcwd()
        self._dir = tempfile.TemporaryDirectory()
        os.chdir(self._dir.name)

    def tearDown(self):
        os.chdir(self._cwd)
        self._dir.cleanup()

    def _read(self):
        ble = FakeBle()
        StorageHandler(ble, 1).on_read_request()
        return json.loads(ble.value)

    def test_reports_the_stored_book_and_its_title(self):
        with open("book.hash", "w") as f:
            f.write("57569a1c")
        with open("book.title", "w") as f:
            f.write("Pride and Prejudice\n")
        data = self._read()
        self.assertEqual(data["book_hash"], "57569a1c")
        self.assertEqual(data["title"], "Pride and Prejudice")

    def test_reports_no_book_and_no_title_before_a_transfer(self):
        data = self._read()
        self.assertEqual(data["book_hash"], "")
        self.assertNotIn("title", data)


if __name__ == "__main__":
    unittest.main()
