import type {Facing,Unit} from '../domain/types';
import {CAST_IDS,castIdentity,type CastId} from './castIdentity';
import generatedWalks from './walk-v2.json';
export interface MotionImage{key:string;path:string;originX:number;originY:number;visibleHeight:number}
export interface WalkImage extends MotionImage {cell:number;frames:number;tilesPerCycle:number;cycleMs:number}
export const CAST_IDLE={
  "lise": {
    "N": {
      "key": "motion-idle-lise-N",
      "path": "/assets/characters/standing-v1/lise/idle-N-d0cf9de56d.png",
      "originX": 0.5,
      "originY": 0.921875,
      "visibleHeight": 179
    },
    "E": {
      "key": "motion-idle-lise-E",
      "path": "/assets/characters/standing-v1/lise/idle-E-6a68829a78.png",
      "originX": 0.5,
      "originY": 0.921875,
      "visibleHeight": 179
    },
    "S": {
      "key": "motion-idle-lise-S",
      "path": "/assets/characters/standing-v1/lise/idle-S-52a0972ae8.png",
      "originX": 0.5,
      "originY": 0.921875,
      "visibleHeight": 179
    },
    "W": {
      "key": "motion-idle-lise-W",
      "path": "/assets/characters/standing-v1/lise/idle-W-e0bc531ab9.png",
      "originX": 0.5,
      "originY": 0.921875,
      "visibleHeight": 179
    }
  },
  "garan": {
    "N": {
      "key": "motion-idle-garan-N",
      "path": "/assets/characters/standing-v1/garan/idle-N-aae14e0a44.png",
      "originX": 0.5,
      "originY": 0.921875,
      "visibleHeight": 179
    },
    "E": {
      "key": "motion-idle-garan-E",
      "path": "/assets/characters/standing-v1/garan/idle-E-9098fdfece.png",
      "originX": 0.5,
      "originY": 0.921875,
      "visibleHeight": 179
    },
    "S": {
      "key": "motion-idle-garan-S",
      "path": "/assets/characters/standing-v1/garan/idle-S-8c7cde84c0.png",
      "originX": 0.5,
      "originY": 0.921875,
      "visibleHeight": 179
    },
    "W": {
      "key": "motion-idle-garan-W",
      "path": "/assets/characters/standing-v1/garan/idle-W-0b31140df1.png",
      "originX": 0.5,
      "originY": 0.921875,
      "visibleHeight": 179
    }
  },
  "neia": {
    "N": {
      "key": "motion-idle-neia-N",
      "path": "/assets/characters/standing-v1/neia/idle-N-48fabb5dfd.png",
      "originX": 0.5,
      "originY": 0.921875,
      "visibleHeight": 179
    },
    "E": {
      "key": "motion-idle-neia-E",
      "path": "/assets/characters/standing-v1/neia/idle-E-901153d627.png",
      "originX": 0.5,
      "originY": 0.921875,
      "visibleHeight": 179
    },
    "S": {
      "key": "motion-idle-neia-S",
      "path": "/assets/characters/standing-v1/neia/idle-S-36b097a39c.png",
      "originX": 0.5,
      "originY": 0.921875,
      "visibleHeight": 179
    },
    "W": {
      "key": "motion-idle-neia-W",
      "path": "/assets/characters/standing-v1/neia/idle-W-db97a3dadc.png",
      "originX": 0.5,
      "originY": 0.921875,
      "visibleHeight": 179
    }
  },
  "sena": {
    "N": {
      "key": "motion-idle-sena-N",
      "path": "/assets/characters/standing-v1/sena/idle-N-cf9b2f017e.png",
      "originX": 0.5,
      "originY": 0.921875,
      "visibleHeight": 179
    },
    "E": {
      "key": "motion-idle-sena-E",
      "path": "/assets/characters/standing-v1/sena/idle-E-b76a07f80f.png",
      "originX": 0.5,
      "originY": 0.921875,
      "visibleHeight": 179
    },
    "S": {
      "key": "motion-idle-sena-S",
      "path": "/assets/characters/standing-v1/sena/idle-S-4686a3ffa7.png",
      "originX": 0.5,
      "originY": 0.921875,
      "visibleHeight": 179
    },
    "W": {
      "key": "motion-idle-sena-W",
      "path": "/assets/characters/standing-v1/sena/idle-W-a34a837b41.png",
      "originX": 0.5,
      "originY": 0.921875,
      "visibleHeight": 179
    }
  },
  "iva": {
    "N": {
      "key": "motion-idle-iva-N",
      "path": "/assets/characters/standing-v1/iva/idle-N-67e75329d3.png",
      "originX": 0.5,
      "originY": 0.921875,
      "visibleHeight": 179
    },
    "E": {
      "key": "motion-idle-iva-E",
      "path": "/assets/characters/standing-v1/iva/idle-E-1c7bc80aa1.png",
      "originX": 0.5,
      "originY": 0.921875,
      "visibleHeight": 179
    },
    "S": {
      "key": "motion-idle-iva-S",
      "path": "/assets/characters/standing-v1/iva/idle-S-b47bd32ee9.png",
      "originX": 0.5,
      "originY": 0.921875,
      "visibleHeight": 179
    },
    "W": {
      "key": "motion-idle-iva-W",
      "path": "/assets/characters/standing-v1/iva/idle-W-fc3e4b316e.png",
      "originX": 0.5,
      "originY": 0.921875,
      "visibleHeight": 179
    }
  },
  "dani": {
    "N": {
      "key": "motion-idle-dani-N",
      "path": "/assets/characters/standing-v1/dani/idle-N-34ac1bdc1c.png",
      "originX": 0.5,
      "originY": 0.921875,
      "visibleHeight": 179
    },
    "E": {
      "key": "motion-idle-dani-E",
      "path": "/assets/characters/standing-v1/dani/idle-E-27e9d9fca6.png",
      "originX": 0.5,
      "originY": 0.921875,
      "visibleHeight": 179
    },
    "S": {
      "key": "motion-idle-dani-S",
      "path": "/assets/characters/standing-v1/dani/idle-S-e53adb0021.png",
      "originX": 0.5,
      "originY": 0.921875,
      "visibleHeight": 179
    },
    "W": {
      "key": "motion-idle-dani-W",
      "path": "/assets/characters/standing-v1/dani/idle-W-19b15a4027.png",
      "originX": 0.5,
      "originY": 0.921875,
      "visibleHeight": 179
    }
  },
  "guard": {
    "N": {
      "key": "motion-idle-guard-N",
      "path": "/assets/characters/standing-v1/guard/idle-N-e2f2d1b9e3.png",
      "originX": 0.5,
      "originY": 0.921875,
      "visibleHeight": 179
    },
    "E": {
      "key": "motion-idle-guard-E",
      "path": "/assets/characters/standing-v1/guard/idle-E-bd88c6ec68.png",
      "originX": 0.5,
      "originY": 0.921875,
      "visibleHeight": 179
    },
    "S": {
      "key": "motion-idle-guard-S",
      "path": "/assets/characters/standing-v1/guard/idle-S-a4724458a7.png",
      "originX": 0.5,
      "originY": 0.921875,
      "visibleHeight": 179
    },
    "W": {
      "key": "motion-idle-guard-W",
      "path": "/assets/characters/standing-v1/guard/idle-W-b873d00b06.png",
      "originX": 0.5,
      "originY": 0.921875,
      "visibleHeight": 179
    }
  },
  "archer": {
    "N": {
      "key": "motion-idle-archer-N",
      "path": "/assets/characters/standing-v1/archer/idle-N-0fa06f1a2c.png",
      "originX": 0.5,
      "originY": 0.921875,
      "visibleHeight": 179
    },
    "E": {
      "key": "motion-idle-archer-E",
      "path": "/assets/characters/standing-v1/archer/idle-E-7067918c50.png",
      "originX": 0.5,
      "originY": 0.921875,
      "visibleHeight": 179
    },
    "S": {
      "key": "motion-idle-archer-S",
      "path": "/assets/characters/standing-v1/archer/idle-S-28a0a4ea57.png",
      "originX": 0.5,
      "originY": 0.921875,
      "visibleHeight": 179
    },
    "W": {
      "key": "motion-idle-archer-W",
      "path": "/assets/characters/standing-v1/archer/idle-W-d71f69cac8.png",
      "originX": 0.5,
      "originY": 0.921875,
      "visibleHeight": 179
    }
  },
  "vesk": {
    "N": {
      "key": "motion-idle-vesk-N",
      "path": "/assets/characters/standing-v1/vesk/idle-N-861dc8dafa.png",
      "originX": 0.5,
      "originY": 0.921875,
      "visibleHeight": 179
    },
    "E": {
      "key": "motion-idle-vesk-E",
      "path": "/assets/characters/standing-v1/vesk/idle-E-fe4a23a7f4.png",
      "originX": 0.5,
      "originY": 0.921875,
      "visibleHeight": 179
    },
    "S": {
      "key": "motion-idle-vesk-S",
      "path": "/assets/characters/standing-v1/vesk/idle-S-bd938ef023.png",
      "originX": 0.5,
      "originY": 0.921875,
      "visibleHeight": 179
    },
    "W": {
      "key": "motion-idle-vesk-W",
      "path": "/assets/characters/standing-v1/vesk/idle-W-fcdfaa7b46.png",
      "originX": 0.5,
      "originY": 0.921875,
      "visibleHeight": 179
    }
  },
  "toma": {
    "N": {
      "key": "motion-idle-toma-N",
      "path": "/assets/characters/standing-v1/toma/idle-N-f4dd4e0904.png",
      "originX": 0.5,
      "originY": 0.921875,
      "visibleHeight": 179
    },
    "E": {
      "key": "motion-idle-toma-E",
      "path": "/assets/characters/standing-v1/toma/idle-E-33d856d635.png",
      "originX": 0.5,
      "originY": 0.921875,
      "visibleHeight": 179
    },
    "S": {
      "key": "motion-idle-toma-S",
      "path": "/assets/characters/standing-v1/toma/idle-S-30bd3b4132.png",
      "originX": 0.5,
      "originY": 0.921875,
      "visibleHeight": 179
    },
    "W": {
      "key": "motion-idle-toma-W",
      "path": "/assets/characters/standing-v1/toma/idle-W-1aa4f6b715.png",
      "originX": 0.5,
      "originY": 0.921875,
      "visibleHeight": 179
    }
  },
  "worker": {
    "N": {
      "key": "motion-idle-worker-N",
      "path": "/assets/characters/standing-v1/worker/idle-N-a21b5a14ff.png",
      "originX": 0.5,
      "originY": 0.921875,
      "visibleHeight": 179
    },
    "E": {
      "key": "motion-idle-worker-E",
      "path": "/assets/characters/standing-v1/worker/idle-E-bb25ed64e2.png",
      "originX": 0.5,
      "originY": 0.921875,
      "visibleHeight": 179
    },
    "S": {
      "key": "motion-idle-worker-S",
      "path": "/assets/characters/standing-v1/worker/idle-S-b7cad5d16d.png",
      "originX": 0.5,
      "originY": 0.921875,
      "visibleHeight": 179
    },
    "W": {
      "key": "motion-idle-worker-W",
      "path": "/assets/characters/standing-v1/worker/idle-W-95e85de9f9.png",
      "originX": 0.5,
      "originY": 0.921875,
      "visibleHeight": 179
    }
  },
  "delegation": {
    "N": {
      "key": "motion-idle-delegation-N",
      "path": "/assets/characters/standing-v1/delegation/idle-N-e95619bedc.png",
      "originX": 0.5,
      "originY": 0.921875,
      "visibleHeight": 179
    },
    "E": {
      "key": "motion-idle-delegation-E",
      "path": "/assets/characters/standing-v1/delegation/idle-E-87ac237d66.png",
      "originX": 0.5,
      "originY": 0.921875,
      "visibleHeight": 179
    },
    "S": {
      "key": "motion-idle-delegation-S",
      "path": "/assets/characters/standing-v1/delegation/idle-S-a8fd1051be.png",
      "originX": 0.5,
      "originY": 0.921875,
      "visibleHeight": 179
    },
    "W": {
      "key": "motion-idle-delegation-W",
      "path": "/assets/characters/standing-v1/delegation/idle-W-87e98f5ca1.png",
      "originX": 0.5,
      "originY": 0.921875,
      "visibleHeight": 179
    }
  }
};
export function castIdle(unit:Pick<Unit,'id'|'weapon'>,direction:Facing):MotionImage|undefined {const id=castIdentity(unit);return id?CAST_IDLE[id][direction]:undefined;}
const LEGACY_CAST_WALK={
  "lise": {
    "N": {
      "key": "motion-walk-lise-N",
      "path": "/assets/unclassified/archive/characters/motion-v1/lise/walk-N.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "E": {
      "key": "motion-walk-lise-E",
      "path": "/assets/unclassified/archive/characters/motion-v1/lise/walk-E.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "S": {
      "key": "motion-walk-lise-S",
      "path": "/assets/unclassified/archive/characters/motion-v1/lise/walk-S.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "W": {
      "key": "motion-walk-lise-W",
      "path": "/assets/unclassified/archive/characters/motion-v1/lise/walk-W.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    }
  },
  "garan": {
    "N": {
      "key": "motion-walk-garan-N",
      "path": "/assets/unclassified/archive/characters/motion-v1/garan/walk-N.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "E": {
      "key": "motion-walk-garan-E",
      "path": "/assets/unclassified/archive/characters/motion-v1/garan/walk-E.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "S": {
      "key": "motion-walk-garan-S",
      "path": "/assets/unclassified/archive/characters/motion-v1/garan/walk-S.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "W": {
      "key": "motion-walk-garan-W",
      "path": "/assets/unclassified/archive/characters/motion-v1/garan/walk-W.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    }
  },
  "neia": {
    "N": {
      "key": "motion-walk-neia-N",
      "path": "/assets/unclassified/archive/characters/motion-v1/neia/walk-N.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "E": {
      "key": "motion-walk-neia-E",
      "path": "/assets/unclassified/archive/characters/motion-v1/neia/walk-E.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "S": {
      "key": "motion-walk-neia-S",
      "path": "/assets/unclassified/archive/characters/motion-v1/neia/walk-S.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "W": {
      "key": "motion-walk-neia-W",
      "path": "/assets/unclassified/archive/characters/motion-v1/neia/walk-W.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    }
  },
  "sena": {
    "N": {
      "key": "motion-walk-sena-N",
      "path": "/assets/unclassified/archive/characters/motion-v1/sena/walk-N.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "E": {
      "key": "motion-walk-sena-E",
      "path": "/assets/unclassified/archive/characters/motion-v1/sena/walk-E.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "S": {
      "key": "motion-walk-sena-S",
      "path": "/assets/unclassified/archive/characters/motion-v1/sena/walk-S.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "W": {
      "key": "motion-walk-sena-W",
      "path": "/assets/unclassified/archive/characters/motion-v1/sena/walk-W.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    }
  },
  "iva": {
    "N": {
      "key": "motion-walk-iva-N",
      "path": "/assets/unclassified/archive/characters/motion-v1/iva/walk-N.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "E": {
      "key": "motion-walk-iva-E",
      "path": "/assets/unclassified/archive/characters/motion-v1/iva/walk-E.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "S": {
      "key": "motion-walk-iva-S",
      "path": "/assets/unclassified/archive/characters/motion-v1/iva/walk-S.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "W": {
      "key": "motion-walk-iva-W",
      "path": "/assets/unclassified/archive/characters/motion-v1/iva/walk-W.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    }
  },
  "dani": {
    "N": {
      "key": "motion-walk-dani-N",
      "path": "/assets/unclassified/archive/characters/motion-v1/dani/walk-N.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "E": {
      "key": "motion-walk-dani-E",
      "path": "/assets/unclassified/archive/characters/motion-v1/dani/walk-E.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "S": {
      "key": "motion-walk-dani-S",
      "path": "/assets/unclassified/archive/characters/motion-v1/dani/walk-S.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "W": {
      "key": "motion-walk-dani-W",
      "path": "/assets/unclassified/archive/characters/motion-v1/dani/walk-W.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    }
  },
  "guard": {
    "N": {
      "key": "motion-walk-guard-N",
      "path": "/assets/unclassified/archive/characters/motion-v1/guard/walk-N.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "E": {
      "key": "motion-walk-guard-E",
      "path": "/assets/unclassified/archive/characters/motion-v1/guard/walk-E.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "S": {
      "key": "motion-walk-guard-S",
      "path": "/assets/unclassified/archive/characters/motion-v1/guard/walk-S.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "W": {
      "key": "motion-walk-guard-W",
      "path": "/assets/unclassified/archive/characters/motion-v1/guard/walk-W.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    }
  },
  "archer": {
    "N": {
      "key": "motion-walk-archer-N",
      "path": "/assets/unclassified/archive/characters/motion-v1/archer/walk-N.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "E": {
      "key": "motion-walk-archer-E",
      "path": "/assets/unclassified/archive/characters/motion-v1/archer/walk-E.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "S": {
      "key": "motion-walk-archer-S",
      "path": "/assets/unclassified/archive/characters/motion-v1/archer/walk-S.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "W": {
      "key": "motion-walk-archer-W",
      "path": "/assets/unclassified/archive/characters/motion-v1/archer/walk-W.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    }
  },
  "vesk": {
    "N": {
      "key": "motion-walk-vesk-N",
      "path": "/assets/unclassified/archive/characters/motion-v1/vesk/walk-N.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "E": {
      "key": "motion-walk-vesk-E",
      "path": "/assets/unclassified/archive/characters/motion-v1/vesk/walk-E.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "S": {
      "key": "motion-walk-vesk-S",
      "path": "/assets/unclassified/archive/characters/motion-v1/vesk/walk-S.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "W": {
      "key": "motion-walk-vesk-W",
      "path": "/assets/unclassified/archive/characters/motion-v1/vesk/walk-W.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    }
  },
  "toma": {
    "N": {
      "key": "motion-walk-toma-N",
      "path": "/assets/unclassified/archive/characters/motion-v1/toma/walk-N.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "E": {
      "key": "motion-walk-toma-E",
      "path": "/assets/unclassified/archive/characters/motion-v1/toma/walk-E.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "S": {
      "key": "motion-walk-toma-S",
      "path": "/assets/unclassified/archive/characters/motion-v1/toma/walk-S.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "W": {
      "key": "motion-walk-toma-W",
      "path": "/assets/unclassified/archive/characters/motion-v1/toma/walk-W.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    }
  },
  "worker": {
    "N": {
      "key": "motion-walk-worker-N",
      "path": "/assets/unclassified/archive/characters/motion-v1/worker/walk-N.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "E": {
      "key": "motion-walk-worker-E",
      "path": "/assets/unclassified/archive/characters/motion-v1/worker/walk-E.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "S": {
      "key": "motion-walk-worker-S",
      "path": "/assets/unclassified/archive/characters/motion-v1/worker/walk-S.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "W": {
      "key": "motion-walk-worker-W",
      "path": "/assets/unclassified/archive/characters/motion-v1/worker/walk-W.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    }
  },
  "delegation": {
    "N": {
      "key": "motion-walk-delegation-N",
      "path": "/assets/unclassified/archive/characters/motion-v1/delegation/walk-N.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "E": {
      "key": "motion-walk-delegation-E",
      "path": "/assets/unclassified/archive/characters/motion-v1/delegation/walk-E.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "S": {
      "key": "motion-walk-delegation-S",
      "path": "/assets/unclassified/archive/characters/motion-v1/delegation/walk-S.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "W": {
      "key": "motion-walk-delegation-W",
      "path": "/assets/unclassified/archive/characters/motion-v1/delegation/walk-W.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    }
  }
};
type WalkOverrides = Partial<Record<CastId,Partial<Record<Facing,WalkImage>>>>;
const overrides:WalkOverrides=generatedWalks;
export const CAST_WALK = Object.fromEntries(CAST_IDS.map(id=>[id,Object.fromEntries(
  (['N','E','S','W'] as Facing[]).map(direction=>[direction,overrides[id]?.[direction]??{
    ...LEGACY_CAST_WALK[id][direction],cell:256,frames:4,tilesPerCycle:2,cycleMs:1080,
  }])
)])) as Record<CastId,Record<Facing,WalkImage>>;
export function castWalk(unit:Pick<Unit,'id'|'weapon'>,direction:Facing):WalkImage|undefined {const id=castIdentity(unit);return id?CAST_WALK[id][direction]:undefined;}
