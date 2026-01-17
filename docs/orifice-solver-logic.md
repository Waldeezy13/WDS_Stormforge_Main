# Orifice Solver Logic

The enhanced outfall solver sizes *stacked circular orifices* so that discharge stays under each storm’s allowable release rate while accounting for the fact that lower orifices contribute flow during higher storms.

## Core idea: incremental sizing

Storms are processed from lowest → highest severity. For storm $k$, we only size for the *increment* above the flow already provided by previously-placed orifices at that storm’s WSE:

```
Q_incremental[k] = Q_allowable[k] - Σ(Q from orifices 1..k-1 at WSE[k])
```

If $Q_{\text{incremental}} \le 0$, no new orifice is added for that storm.

## Geometry constraint: stack with a gap

Each orifice invert must clear the previous orifice’s top by a configurable gap:

```
invert[k] ≥ invert[k-1] + diameter[k-1] + gap
```

## Direct diameter equation

For a circular orifice in orifice-flow regime:

$$Q = C_d A \sqrt{2gh},\quad A = \frac{\pi}{4}D^2$$

Solving for $D$:

$$D = \sqrt{\frac{4Q}{C_d\pi\sqrt{2gh}}}$$

Where $h$ is head to the centroid (ft), $g$ is 32.2 ft/s², and $Q$ is cfs.

## Global verify-and-shrink

After initial placement/sizing, the solver verifies all storms. If any storm exceeds allowable (beyond tolerance), it proportionally shrinks the relevant active orifice and repeats until passing or reaching a max-iteration limit.

## Guardrails

- Max allowed exceedance: `SOLVER_Q_MAX_OVERAGE`
- Minimum diameter: `MIN_ORIFICE_DIAMETER`
- Overlap prevention: reject any placement that would intersect previous orifices

## Where it lives

- `src/utils/pondRouting.ts` (main solver)
- `src/utils/hydraulics.ts` + `src/utils/hydraulicsConfig.ts` (equations/constants)
- `src/utils/stageStorage.ts` (volume ↔ elevation)

## Failure modes

Common explicit failures include: no vertical space, WSE at/below invert, minimum size still exceeds allowable, overlap, or non-convergence.
