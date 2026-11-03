"""Synthetic regression only: no user sprite is modified by these tests."""
import unittest
import numpy as np
from walk_body_registration import body_factor,inverse_body_y,register_body


class BodyRegistration(unittest.TestCase):
    def test_head_bytes_unchanged_and_one_mapping_preserves_motion(self):
        rng=np.random.default_rng(7);frames=[]
        for bottom in [279,286,292]:
            a=np.zeros((320,256,4),dtype=np.uint8);a[90:160,95:165]=rng.integers(0,256,(70,70,4),dtype=np.uint8)
            a[165:bottom+1,105:150]=[50,100,150,255];frames.append(a)
        factor=body_factor(292);outputs=[register_body(a,factor,280,180) for a in frames]
        for a,b in zip(frames,outputs):np.testing.assert_array_equal(a[:166],b[:166])
        bottoms=[np.where(a[:,:,3]>128)[0].max() for a in outputs]
        self.assertLessEqual(abs(bottoms[-1]-280),1)
        self.assertGreater(bottoms[-1]-bottoms[0],8)
        self.assertEqual(len(outputs),len(frames))

    def test_inverse_map_is_monotone_and_identity_at_head(self):
        ys=np.arange(320,dtype=float)
        for peak in [274,286,292]:
            mapped=inverse_body_y(ys,body_factor(peak))
            self.assertTrue(np.all(np.diff(mapped)>0))
            np.testing.assert_array_equal(mapped[:166],ys[:166])

    def test_large_anatomical_change_is_rejected(self):
        with self.assertRaises(ValueError):body_factor(330)


if __name__=='__main__':unittest.main()
