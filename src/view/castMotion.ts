import type {Facing,Unit} from '../domain/types';
import {castIdentity} from './castIdentity';
export interface MotionImage{key:string;path:string;originX:number;originY:number;visibleHeight:number}
export const CAST_IDLE={
  "lise": {
    "N": {
      "key": "motion-idle-lise-N",
      "path": "/assets/motion-v1/lise/idle-N.png",
      "originX": 0.5,
      "originY": 0.96484375,
      "visibleHeight": 195
    },
    "E": {
      "key": "motion-idle-lise-E",
      "path": "/assets/motion-v1/lise/idle-E.png",
      "originX": 0.5,
      "originY": 0.97265625,
      "visibleHeight": 198
    },
    "S": {
      "key": "motion-idle-lise-S",
      "path": "/assets/motion-v1/lise/idle-S.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "W": {
      "key": "motion-idle-lise-W",
      "path": "/assets/motion-v1/lise/idle-W.png",
      "originX": 0.5,
      "originY": 0.97265625,
      "visibleHeight": 198
    }
  },
  "garan": {
    "N": {
      "key": "motion-idle-garan-N",
      "path": "/assets/motion-v1/garan/idle-N.png",
      "originX": 0.5,
      "originY": 0.96484375,
      "visibleHeight": 200
    },
    "E": {
      "key": "motion-idle-garan-E",
      "path": "/assets/motion-v1/garan/idle-E.png",
      "originX": 0.5,
      "originY": 0.96875,
      "visibleHeight": 203
    },
    "S": {
      "key": "motion-idle-garan-S",
      "path": "/assets/motion-v1/garan/idle-S.png",
      "originX": 0.5,
      "originY": 0.97265625,
      "visibleHeight": 202
    },
    "W": {
      "key": "motion-idle-garan-W",
      "path": "/assets/motion-v1/garan/idle-W.png",
      "originX": 0.5,
      "originY": 0.95703125,
      "visibleHeight": 202
    }
  },
  "neia": {
    "N": {
      "key": "motion-idle-neia-N",
      "path": "/assets/motion-v1/neia/idle-N.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 194
    },
    "E": {
      "key": "motion-idle-neia-E",
      "path": "/assets/motion-v1/neia/idle-E.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "S": {
      "key": "motion-idle-neia-S",
      "path": "/assets/motion-v1/neia/idle-S.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 196
    },
    "W": {
      "key": "motion-idle-neia-W",
      "path": "/assets/motion-v1/neia/idle-W.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 194
    }
  },
  "sena": {
    "N": {
      "key": "motion-idle-sena-N",
      "path": "/assets/motion-v1/sena/idle-N.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "E": {
      "key": "motion-idle-sena-E",
      "path": "/assets/motion-v1/sena/idle-E.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "S": {
      "key": "motion-idle-sena-S",
      "path": "/assets/motion-v1/sena/idle-S.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "W": {
      "key": "motion-idle-sena-W",
      "path": "/assets/motion-v1/sena/idle-W.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    }
  },
  "iva": {
    "N": {
      "key": "motion-idle-iva-N",
      "path": "/assets/motion-v1/iva/idle-N.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "E": {
      "key": "motion-idle-iva-E",
      "path": "/assets/motion-v1/iva/idle-E.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "S": {
      "key": "motion-idle-iva-S",
      "path": "/assets/motion-v1/iva/idle-S.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "W": {
      "key": "motion-idle-iva-W",
      "path": "/assets/motion-v1/iva/idle-W.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    }
  },
  "dani": {
    "N": {
      "key": "motion-idle-dani-N",
      "path": "/assets/motion-v1/dani/idle-N.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "E": {
      "key": "motion-idle-dani-E",
      "path": "/assets/motion-v1/dani/idle-E.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "S": {
      "key": "motion-idle-dani-S",
      "path": "/assets/motion-v1/dani/idle-S.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "W": {
      "key": "motion-idle-dani-W",
      "path": "/assets/motion-v1/dani/idle-W.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    }
  },
  "guard": {
    "N": {
      "key": "motion-idle-guard-N",
      "path": "/assets/motion-v1/guard/idle-N.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "E": {
      "key": "motion-idle-guard-E",
      "path": "/assets/motion-v1/guard/idle-E.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "S": {
      "key": "motion-idle-guard-S",
      "path": "/assets/motion-v1/guard/idle-S.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "W": {
      "key": "motion-idle-guard-W",
      "path": "/assets/motion-v1/guard/idle-W.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    }
  },
  "archer": {
    "N": {
      "key": "motion-idle-archer-N",
      "path": "/assets/motion-v1/archer/idle-N.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "E": {
      "key": "motion-idle-archer-E",
      "path": "/assets/motion-v1/archer/idle-E.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "S": {
      "key": "motion-idle-archer-S",
      "path": "/assets/motion-v1/archer/idle-S.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "W": {
      "key": "motion-idle-archer-W",
      "path": "/assets/motion-v1/archer/idle-W.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    }
  },
  "vesk": {
    "N": {
      "key": "motion-idle-vesk-N",
      "path": "/assets/motion-v1/vesk/idle-N.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "E": {
      "key": "motion-idle-vesk-E",
      "path": "/assets/motion-v1/vesk/idle-E.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "S": {
      "key": "motion-idle-vesk-S",
      "path": "/assets/motion-v1/vesk/idle-S.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "W": {
      "key": "motion-idle-vesk-W",
      "path": "/assets/motion-v1/vesk/idle-W.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    }
  },
  "toma": {
    "N": {
      "key": "motion-idle-toma-N",
      "path": "/assets/motion-v1/toma/idle-N.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 198
    },
    "E": {
      "key": "motion-idle-toma-E",
      "path": "/assets/motion-v1/toma/idle-E.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "S": {
      "key": "motion-idle-toma-S",
      "path": "/assets/motion-v1/toma/idle-S.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 195
    },
    "W": {
      "key": "motion-idle-toma-W",
      "path": "/assets/motion-v1/toma/idle-W.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    }
  },
  "worker": {
    "N": {
      "key": "motion-idle-worker-N",
      "path": "/assets/motion-v1/worker/idle-N.png",
      "originX": 0.5,
      "originY": 0.87890625,
      "visibleHeight": 191
    },
    "E": {
      "key": "motion-idle-worker-E",
      "path": "/assets/motion-v1/worker/idle-E.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "S": {
      "key": "motion-idle-worker-S",
      "path": "/assets/motion-v1/worker/idle-S.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "W": {
      "key": "motion-idle-worker-W",
      "path": "/assets/motion-v1/worker/idle-W.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    }
  },
  "delegation": {
    "N": {
      "key": "motion-idle-delegation-N",
      "path": "/assets/motion-v1/delegation/idle-N.png",
      "originX": 0.5,
      "originY": 0.87890625,
      "visibleHeight": 195
    },
    "E": {
      "key": "motion-idle-delegation-E",
      "path": "/assets/motion-v1/delegation/idle-E.png",
      "originX": 0.5,
      "originY": 0.8828125,
      "visibleHeight": 198
    },
    "S": {
      "key": "motion-idle-delegation-S",
      "path": "/assets/motion-v1/delegation/idle-S.png",
      "originX": 0.5,
      "originY": 0.8828125,
      "visibleHeight": 198
    },
    "W": {
      "key": "motion-idle-delegation-W",
      "path": "/assets/motion-v1/delegation/idle-W.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    }
  }
};
export function castIdle(unit:Pick<Unit,'id'|'weapon'>,direction:Facing):MotionImage|undefined {const id=castIdentity(unit);return id?CAST_IDLE[id][direction]:undefined;}
export const CAST_WALK={
  "lise": {
    "N": {
      "key": "motion-walk-lise-N",
      "path": "/assets/motion-v1/lise/walk-N.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "E": {
      "key": "motion-walk-lise-E",
      "path": "/assets/motion-v1/lise/walk-E.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "S": {
      "key": "motion-walk-lise-S",
      "path": "/assets/motion-v1/lise/walk-S.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "W": {
      "key": "motion-walk-lise-W",
      "path": "/assets/motion-v1/lise/walk-W.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    }
  },
  "garan": {
    "N": {
      "key": "motion-walk-garan-N",
      "path": "/assets/motion-v1/garan/walk-N.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "E": {
      "key": "motion-walk-garan-E",
      "path": "/assets/motion-v1/garan/walk-E.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "S": {
      "key": "motion-walk-garan-S",
      "path": "/assets/motion-v1/garan/walk-S.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "W": {
      "key": "motion-walk-garan-W",
      "path": "/assets/motion-v1/garan/walk-W.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    }
  },
  "neia": {
    "N": {
      "key": "motion-walk-neia-N",
      "path": "/assets/motion-v1/neia/walk-N.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "E": {
      "key": "motion-walk-neia-E",
      "path": "/assets/motion-v1/neia/walk-E.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "S": {
      "key": "motion-walk-neia-S",
      "path": "/assets/motion-v1/neia/walk-S.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "W": {
      "key": "motion-walk-neia-W",
      "path": "/assets/motion-v1/neia/walk-W.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    }
  },
  "sena": {
    "N": {
      "key": "motion-walk-sena-N",
      "path": "/assets/motion-v1/sena/walk-N.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "E": {
      "key": "motion-walk-sena-E",
      "path": "/assets/motion-v1/sena/walk-E.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "S": {
      "key": "motion-walk-sena-S",
      "path": "/assets/motion-v1/sena/walk-S.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "W": {
      "key": "motion-walk-sena-W",
      "path": "/assets/motion-v1/sena/walk-W.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    }
  },
  "iva": {
    "N": {
      "key": "motion-walk-iva-N",
      "path": "/assets/motion-v1/iva/walk-N.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "E": {
      "key": "motion-walk-iva-E",
      "path": "/assets/motion-v1/iva/walk-E.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "S": {
      "key": "motion-walk-iva-S",
      "path": "/assets/motion-v1/iva/walk-S.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "W": {
      "key": "motion-walk-iva-W",
      "path": "/assets/motion-v1/iva/walk-W.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    }
  },
  "dani": {
    "N": {
      "key": "motion-walk-dani-N",
      "path": "/assets/motion-v1/dani/walk-N.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "E": {
      "key": "motion-walk-dani-E",
      "path": "/assets/motion-v1/dani/walk-E.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "S": {
      "key": "motion-walk-dani-S",
      "path": "/assets/motion-v1/dani/walk-S.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "W": {
      "key": "motion-walk-dani-W",
      "path": "/assets/motion-v1/dani/walk-W.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    }
  },
  "guard": {
    "N": {
      "key": "motion-walk-guard-N",
      "path": "/assets/motion-v1/guard/walk-N.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "E": {
      "key": "motion-walk-guard-E",
      "path": "/assets/motion-v1/guard/walk-E.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "S": {
      "key": "motion-walk-guard-S",
      "path": "/assets/motion-v1/guard/walk-S.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "W": {
      "key": "motion-walk-guard-W",
      "path": "/assets/motion-v1/guard/walk-W.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    }
  },
  "archer": {
    "N": {
      "key": "motion-walk-archer-N",
      "path": "/assets/motion-v1/archer/walk-N.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "E": {
      "key": "motion-walk-archer-E",
      "path": "/assets/motion-v1/archer/walk-E.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "S": {
      "key": "motion-walk-archer-S",
      "path": "/assets/motion-v1/archer/walk-S.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "W": {
      "key": "motion-walk-archer-W",
      "path": "/assets/motion-v1/archer/walk-W.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    }
  },
  "vesk": {
    "N": {
      "key": "motion-walk-vesk-N",
      "path": "/assets/motion-v1/vesk/walk-N.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "E": {
      "key": "motion-walk-vesk-E",
      "path": "/assets/motion-v1/vesk/walk-E.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "S": {
      "key": "motion-walk-vesk-S",
      "path": "/assets/motion-v1/vesk/walk-S.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "W": {
      "key": "motion-walk-vesk-W",
      "path": "/assets/motion-v1/vesk/walk-W.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    }
  },
  "toma": {
    "N": {
      "key": "motion-walk-toma-N",
      "path": "/assets/motion-v1/toma/walk-N.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "E": {
      "key": "motion-walk-toma-E",
      "path": "/assets/motion-v1/toma/walk-E.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "S": {
      "key": "motion-walk-toma-S",
      "path": "/assets/motion-v1/toma/walk-S.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "W": {
      "key": "motion-walk-toma-W",
      "path": "/assets/motion-v1/toma/walk-W.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    }
  },
  "worker": {
    "N": {
      "key": "motion-walk-worker-N",
      "path": "/assets/motion-v1/worker/walk-N.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "E": {
      "key": "motion-walk-worker-E",
      "path": "/assets/motion-v1/worker/walk-E.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "S": {
      "key": "motion-walk-worker-S",
      "path": "/assets/motion-v1/worker/walk-S.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "W": {
      "key": "motion-walk-worker-W",
      "path": "/assets/motion-v1/worker/walk-W.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    }
  },
  "delegation": {
    "N": {
      "key": "motion-walk-delegation-N",
      "path": "/assets/motion-v1/delegation/walk-N.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "E": {
      "key": "motion-walk-delegation-E",
      "path": "/assets/motion-v1/delegation/walk-E.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "S": {
      "key": "motion-walk-delegation-S",
      "path": "/assets/motion-v1/delegation/walk-S.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    },
    "W": {
      "key": "motion-walk-delegation-W",
      "path": "/assets/motion-v1/delegation/walk-W.png",
      "originX": 0.5,
      "originY": 0.88671875,
      "visibleHeight": 199
    }
  }
};
export function castWalk(unit:Pick<Unit,'id'|'weapon'>,direction:Facing):MotionImage|undefined {const id=castIdentity(unit);return id?CAST_WALK[id][direction]:undefined;}
