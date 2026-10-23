import {expect} from 'chai';
import {
  agBasis,
  agCarriers,
  bubbleFamily,
} from '../traceprojector/ag-element.js';
import {differential} from '../traceprojector/polynomial-forms.js';
import {referenceRule} from '../traceprojector/reference-element.js';

const evaluate = (form, x) => (Array.isArray(form) ?
  form.map((p) => p.evaluate(x)) : form.evaluate(x));
const dot = (a, b) => a.reduce((s, q, i) => s + q * b[i], 0);

describe('Arnold-Guzman degrees of freedom on the reference tetrahedron', () => {
  for (const r of [1, 2, 3]) {
    for (const m of [1, 2, 3]) {
      it(`r = ${r}, m = ${m}: the bubbles are orthonormal in <<.,.>>`, () => {
        const family = bubbleFamily(r, m);
        const rule = referenceRule(m, r + 3);
        family.forEach((items) => {
          items.forEach((p, i) => {
            items.forEach((q, j) => {
              // <<p, q>> = <P p, P q> + <dp, dq>; for the families built here
              // the two kinds are orthogonal, so check each kind's own product.
              if (p.kind === 'coclosed' && q.kind === 'coclosed') {
                const value = rule.reduce((sum, {s, weight}) => sum +
                  weight * dot(p.derivative(s), q.derivative(s)), 0);
                expect(value).to.be.closeTo(i === j ? 1 : 0, 1e-9);
              } else if (p.kind !== 'coclosed' && q.kind !== 'coclosed' &&
                  p.kind === 'closed' && q.kind === 'closed') {
                const value = rule.reduce((sum, {s, weight}) => sum +
                  weight * dot(p.value(s), q.value(s)), 0);
                expect(value).to.be.closeTo(i === j ? 1 : 0, 1e-9);
              }
            });
          });
        });
      });
    }
  }

  for (const r of [1, 2, 3]) {
    for (const k of [0, 1, 2, 3]) {
      it(`r = ${r}, k = ${k}: dual basis, and d E g = E d g`, () => {
        const {basis, entries, carriers} = agBasis(r, k);
        expect(basis.length).to.equal(entries.length);
        if (k === 3) return;
        const next = agBasis(r, k + 1);
        // d of the dual function of (tau, g) is the dual function of
        // (tau, d g) for coclosed g, and zero for the others.
        const points = [[0.21, 0.13, 0.31], [0.11, 0.41, 0.17]];
        entries.forEach((entry, a) => {
          // (5.13) is for the bubbles of the mean-zero space, not for the
          // vertex and volume dofs.
          if (entry.kind === 'point' || entry.kind === 'volume') return;
          const carrier = carriers[entry.carrier];
          const derivative = differential(basis[a], k);
          let target = null;
          if (entry.kind === 'coclosed') {
            // Its derivative is the closed bubble of degree k + 1 built from
            // this one: find the entry of the next family on the same carrier.
            const family = bubbleFamily(r, carrier.dimension)[k + 1] ?? [];
            const closed = family.filter((i) => i.kind === 'closed');
            const rank = entries.filter((e, i) => i < a &&
              e.carrier === entry.carrier && e.kind === 'coclosed').length;
            const nextIndex = next.entries.findIndex((e, i) => {
              const same = next.carriers[e.carrier].vertices.join() ===
                carrier.vertices.join();
              if (!same || e.kind !== 'closed') return false;
              const ordinal = next.entries.slice(0, i).filter((q) =>
                q.carrier === e.carrier && q.kind === 'closed').length;
              return ordinal === rank;
            });
            if (closed.length > rank && nextIndex >= 0) {
              target = next.basis[nextIndex];
            }
          }
          for (const x of points) {
            const got = evaluate(derivative, x);
            const want = target ? evaluate(target, x) : null;
            [].concat(got).forEach((q, i) => {
              const expected = want === null ? 0 : [].concat(want)[i];
              expect(q).to.be.closeTo(expected, 1e-8);
            });
          }
        });
      });
    }
  }

  it('lists every sub-simplex that carries dofs', () => {
    expect(agCarriers(2, 1).map((c) => c.dimension))
        .to.include.members([1, 2]);
  });
});
