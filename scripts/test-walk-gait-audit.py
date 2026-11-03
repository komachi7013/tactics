"""Regression examples for the gait acceptance gate; no generation needed."""
import importlib.util
import unittest
from pathlib import Path

import numpy as np

spec = importlib.util.spec_from_file_location("audit", Path(__file__).with_name("audit-walk-gait.py"))
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)
shadow_spec=importlib.util.spec_from_file_location('revise',Path(__file__).with_name('revise-higgsfield-walks.py'))
revise=importlib.util.module_from_spec(shadow_spec);shadow_spec.loader.exec_module(revise)


class GaitAcceptance(unittest.TestCase):
    def check_contacts(self, events, digest="current"):
        return audit.contact_check({"sheet_sha256": digest, "contacts": [
            {"frame": f, "foot": foot} for f, foot in events]}, 24, 720, 4, "current")

    def test_no_annotations_cannot_pass_from_regular_timing_alone(self):
        self.assertEqual(audit.contact_check(None, 24, 720, 4, "current")["status"], "unverified")

    def test_alternating_pair_and_closure_measures_cadence(self):
        result = self.check_contacts([(0, "L"), (12, "R"), (24, "L")])
        self.assertEqual(result["status"], "verified-contacts")
        self.assertEqual(result["contactIntervalsMs"], [360, 360])
        self.assertEqual(result["tilesPerStep"], 2)

    def test_same_foot_stamping_rejected(self):
        self.assertEqual(self.check_contacts([(0, "L"), (12, "L"), (24, "L")])["status"], "rejected")

    def test_two_cycles_squeezed_into_one_common_duration_rejected(self):
        self.assertEqual(self.check_contacts([(0, "L"), (6, "R"), (12, "L"),
                                             (18, "R"), (24, "L")])["status"], "rejected")

    def test_lopsided_step_timing_rejected(self):
        self.assertEqual(self.check_contacts([(0, "L"), (4, "R"), (24, "L")])["status"], "rejected")

    def test_old_annotations_invalid_after_asset_change(self):
        self.assertEqual(self.check_contacts([(0, "L"), (12, "R"), (24, "L")], "old")["status"], "rejected")

    def test_closure_contact_required(self):
        self.assertEqual(self.check_contacts([(0, "L"), (12, "R"), (23, "L")])["status"], "rejected")

    def test_loop_seam_may_precede_first_contact(self):
        self.assertEqual(self.check_contacts([(3, "L"), (15, "R"), (27, "L")])["status"], "verified-contacts")

    def test_hold_detection_crosses_loop_boundary(self):
        a = np.zeros((12, 8, 8, 4), dtype=np.uint8)
        a[:, :, :, 3] = 255
        # Frames 10,11,0,1,2 are identical; a boundary hold must not split into two.
        for i in range(3, 10): a[i, :, :, 0] = i * 20
        m = audit.motion_metrics(a, 720)
        self.assertEqual(m["longestLowMotionMs"], 240)

    def test_floor_rule_removal_preserves_grey_trousers_and_brown_boots(self):
        rgb=np.zeros((100,100,3),dtype=np.int16);alpha=np.zeros((100,100),dtype=np.uint8)
        rgb[40:70,40:60]=(80,65,86);alpha[40:70,40:60]=255
        rgb[80,:]=(70,15,50);alpha[80,:]=255
        rgb[80,45:55]=(90,40,15)
        mask=revise.ground_shadow_mask(rgb,alpha,50,45)
        self.assertFalse(mask[50,50], 'grey cloth must survive magenta shadow removal')
        self.assertTrue(mask[80,10], 'wide magenta floor rule must be removed')
        self.assertFalse(mask[80,50], 'brown boot at floor-rule height must survive')


if __name__ == "__main__": unittest.main()
