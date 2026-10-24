/**
 * The Gmsh reader: ASCII formats 2.2 and 4.1 give the arrays the operators
 * take, what the library cannot use is a ValidateError, and no text at all
 * makes it throw anything else.
 */
import {expect} from 'chai';
import fc from 'fast-check';
import {
  Mesh, StableProjector, ValidateError, parseGmsh,
} from '../traceprojector/traceprojector.js';
import {generateUnitCubeMesh} from '../traceprojector/generator.js';

// Two tetrahedra sharing a face, a triangle and a line on the boundary, and
// node numbers that are not contiguous (Gmsh numbers nodes by entity).
const legacy = `$MeshFormat
2.2 0 8
$EndMeshFormat
$Nodes
5
10 0 0 0
11 1 0 0
12 0 1 0
13 0 0 1
40 1 1 -1
$EndNodes
$Elements
4
1 1 2 0 1 10 11
2 2 2 0 1 10 11 12
3 4 2 0 1 10 11 12 13
4 4 2 0 1 10 12 11 40
$EndElements
`;

const blocks = `$MeshFormat
4.1 0 8
$EndMeshFormat
$Nodes
2 5 1 5
2 1 0 3
1
2
3
0 0 0
1 0 0
0 1 0
3 1 0 2
4
5
0 0 1
1 1 -1
$EndNodes
$Elements
2 3 1 3
2 1 2 1
1 1 2 3
3 1 4 2
2 1 2 3 4
3 3 2 1 5
$EndElements
`;

describe('parseGmsh', () => {
  it('reads format 2.2: numbers the nodes from 0 and skips the rest', () => {
    const {vertices, tetrahedra, skipped} = parseGmsh(legacy);
    expect(vertices).to.deep.equal(
        [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, -1]]);
    expect(tetrahedra).to.have.length(2);
    expect(skipped).to.deep.equal({lines: 1, triangles: 1});
  });

  it('reads format 4.1', () => {
    const {vertices, tetrahedra} = parseGmsh(blocks);
    expect(vertices).to.have.length(5);
    expect(tetrahedra).to.have.length(2);
  });

  it('gives positively oriented tetrahedra a Mesh accepts', () => {
    for (const text of [legacy, blocks]) {
      const {vertices, tetrahedra} = parseGmsh(text);
      expect(() => new Mesh(vertices, tetrahedra)).to.not.throw();
    }
  });

  it('keeps the orientation of the file when asked', () => {
    const flipped = legacy.replace('3 4 2 0 1 10 11 12 13', '3 4 2 0 1 10 12 11 13');
    const {vertices, tetrahedra} = parseGmsh(flipped, {orient: false});
    expect(() => new Mesh(vertices, tetrahedra)).to.throw(ValidateError);
    expect(() => new StableProjector(vertices, tetrahedra)).to.not.throw();
  });

  it('drops nodes that no tetrahedron uses', () => {
    const text = legacy.replace('5\n10', '6\n99 5 5 5\n10');
    expect(parseGmsh(text).vertices).to.have.length(5);
  });

  it('round-trips a generated cube', () => {
    const cube = generateUnitCubeMesh(3);
    const v = cube.getVertices();
    const t = cube.getTetrahedra();
    const text = ['$MeshFormat', '2.2 0 8', '$EndMeshFormat', '$Nodes',
      String(v.length), ...v.map((p, i) => `${i + 1} ${p.join(' ')}`),
      '$EndNodes', '$Elements', String(t.length),
      ...t.map((c, i) => `${i + 1} 4 2 0 1 ${c.map((q) => q + 1).join(' ')}`),
      '$EndElements', ''].join('\n');
    const read = parseGmsh(text);
    expect(read.vertices).to.deep.equal(v);
    expect(read.tetrahedra).to.deep.equal(t);
  });

  it('reads Windows line endings', () => {
    expect(parseGmsh(legacy.replace(/\n/g, '\r\n')).tetrahedra).to.have
        .length(2);
  });

  describe('refuses what it cannot use, with a ValidateError', () => {
    const cases = {
      'a binary file': legacy.replace('2.2 0 8', '2.2 1 8'),
      'another version': legacy.replace('2.2 0 8', '3.0 0 8'),
      'version 4.0': blocks.replace('4.1 0 8', '4.0 0 8'),
      'text that is not a mesh': 'hello',
      'an empty file': '',
      'no tetrahedra': legacy.replace(/3 4 2 0 1.*\n4 4 2 0 1.*\n/, '')
          .replace('4\n1 1', '2\n1 1'),
      'a missing section': legacy.replace(/\$Elements[\s\S]*\$EndElements\n/,
          ''),
      'a miscounted node section': legacy.replace('5\n10', '6\n10'),
      'a miscounted element section': legacy.replace('4\n1 1 2', '5\n1 1 2'),
      'hexahedra': legacy.replace('4 4 2 0 1 10 12 11 40',
          '4 5 2 0 1 10 12 11 40 13 13 13 13'),
      'second-order tetrahedra': legacy.replace('4 4 2 0 1 10 12 11 40',
          '4 11 2 0 1 10 12 11 40 10 11 12 13 40 10'),
      'a tetrahedron with three nodes': legacy.replace(
          '3 4 2 0 1 10 11 12 13', '3 4 2 0 1 10 11 12'),
      'a node that is not defined': legacy.replace('1 10 11 12 13',
          '1 10 11 12 77'),
      'a coordinate that is not finite': legacy.replace('11 1 0 0',
          '11 NaN 0 0'),
      'a flat tetrahedron': legacy.replace('13 0 0 1', '13 1 1 0'),
      'a truncated 4.1 node block': blocks.replace('2\n3\n0 0 0', '2\n3'),
    };
    for (const [what, text] of Object.entries(cases)) {
      it(what, () => {
        expect(() => parseGmsh(text)).to.throw(ValidateError);
      });
    }

    it('anything that is not a string', () => {
      for (const value of [null, undefined, 5, {}, []]) {
        expect(() => parseGmsh(value)).to.throw(ValidateError);
      }
    });
  });

  it('only ever raises a ValidateError, whatever the text', () => {
    const mutate = fc.tuple(
        fc.constantFrom(legacy, blocks),
        fc.nat(legacy.length - 1),
        fc.string({maxLength: 6}),
        fc.nat(8));
    fc.assert(fc.property(fc.oneof(fc.string(), mutate.map(
        ([base, at, insert, cut]) => base.slice(0, at) + insert +
          base.slice(at + cut))), (text) => {
      try {
        parseGmsh(text);
      } catch (error) {
        return error instanceof ValidateError;
      }
      return true;
    }), {numRuns: 2000});
  });
});
