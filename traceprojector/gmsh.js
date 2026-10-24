/**
 * Reader for Gmsh mesh files (.msh), ASCII formats 2.x and 4.1, giving the
 * two arrays every operator takes: vertex coordinates and four vertex numbers
 * per tetrahedron.
 *
 * Only first-order tetrahedra (element type 4) become cells. Points, lines and
 * triangles, which Gmsh writes for the physical groups of the boundary, are
 * counted and skipped. Anything the library cannot use is a ValidateError
 * rather than a silently different mesh: binary files, other versions, other
 * 3D elements (hexahedra, prisms, pyramids) and second-order tetrahedra.
 */

import {ValidateError} from './errors.js';
import {validateMeshInput} from './mesh.js';
import {tetDeterminant} from './utils.js';

const TETRAHEDRON = 4;
const SKIPPED = new Map([
  [15, 'points'], [1, 'lines'], [2, 'triangles'], [3, 'quadrangles'],
]);
const UNSUPPORTED = new Map([
  [11, 'second-order tetrahedra'], [5, 'hexahedra'], [6, 'prisms'],
  [7, 'pyramids'], [29, 'third-order tetrahedra'],
]);

/** Splits a section body into trimmed, non-empty lines. */
function lines(text) {
  return text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== '');
}

/** Sections of the file by name: `$Name ... $EndName`. */
function sections(text) {
  const out = new Map();
  const re = /\$([A-Za-z]+)[ \t]*\r?\n([\s\S]*?)\$End\1/g;
  let m;
  while ((m = re.exec(text)) !== null) out.set(m[1], lines(m[2]));
  return out;
}

const integer = (token, what) => {
  if (!/^[+-]?\d+$/.test(token ?? '')) {
    throw new ValidateError(`${what} is not an integer: "${token}"`);
  }
  return Number(token);
};

const real = (token, what) => {
  const value = Number(token);
  if (token === undefined || token === '' || !Number.isFinite(value)) {
    throw new ValidateError(`${what} is not a finite number: "${token}"`);
  }
  return value;
};

const fields = (line) => (line ?? '').split(/\s+/);

/** Counts an element that does not become a cell, or refuses it. */
function note(ignored, type) {
  if (UNSUPPORTED.has(type)) {
    throw new ValidateError(`the file has ${UNSUPPORTED.get(type)} (element ` +
      `type ${type}); only first-order tetrahedra are supported. Mesh with ` +
      'first-order elements and tetrahedra only.');
  }
  const name = SKIPPED.get(type) ?? `elements of type ${type}`;
  ignored.set(name, (ignored.get(name) ?? 0) + 1);
}

/** The four node numbers of a tetrahedron line, after `skip` leading fields. */
function tetrahedronNodes(line, skip) {
  const ids = fields(line).slice(skip);
  if (ids.length !== 4) {
    throw new ValidateError(
        `a tetrahedron has ${ids.length} nodes: "${line}"`);
  }
  return ids.map((t) => integer(t, 'a node number'));
}

/** Nodes and tetrahedra of a 2.x file: `id x y z` and `id type ntags ...`. */
function readLegacy(nodeLines, elementLines) {
  const count = integer(nodeLines[0], 'the node count');
  if (nodeLines.length !== count + 1) {
    throw new ValidateError(`$Nodes announces ${count} nodes and lists ${
      nodeLines.length - 1}`);
  }
  const nodes = new Map();
  for (const line of nodeLines.slice(1)) {
    const f = fields(line);
    if (f.length < 4) throw new ValidateError(`bad node line "${line}"`);
    nodes.set(integer(f[0], 'a node number'), [
      real(f[1], 'a coordinate'), real(f[2], 'a coordinate'),
      real(f[3], 'a coordinate')]);
  }
  const total = integer(elementLines[0], 'the element count');
  if (elementLines.length !== total + 1) {
    throw new ValidateError(`$Elements announces ${total} elements and ` +
      `lists ${elementLines.length - 1}`);
  }
  const cells = [];
  const ignored = new Map();
  for (const line of elementLines.slice(1)) {
    const f = fields(line);
    if (f.length < 4) throw new ValidateError(`bad element line "${line}"`);
    const type = integer(f[1], 'an element type');
    if (type === TETRAHEDRON) {
      cells.push(tetrahedronNodes(line, 3 + integer(f[2], 'a tag count')));
    } else {
      note(ignored, type);
    }
  }
  return {nodes, cells, ignored};
}

/** Nodes and tetrahedra of a 4.1 file, which come in blocks by entity. */
function readBlocks(nodeLines, elementLines) {
  const nodes = new Map();
  const blocks = integer(fields(nodeLines[0])[0], 'the node block count');
  let at = 1;
  for (let b = 0; b < blocks; b++) {
    const size = integer(fields(nodeLines[at++])[3], 'a node block size');
    const tags = nodeLines.slice(at, at + size)
        .map((l) => integer(l, 'a node number'));
    at += size;
    const coords = nodeLines.slice(at, at + size);
    at += size;
    if (tags.length !== size || coords.length !== size) {
      throw new ValidateError('a node block is shorter than it announces');
    }
    tags.forEach((id, i) => {
      const f = fields(coords[i]);
      if (f.length < 3) throw new ValidateError(`bad node line "${coords[i]}"`);
      nodes.set(id, [real(f[0], 'a coordinate'), real(f[1], 'a coordinate'),
        real(f[2], 'a coordinate')]);
    });
  }
  const cells = [];
  const ignored = new Map();
  const elementBlocks = integer(fields(elementLines[0])[0],
      'the element block count');
  at = 1;
  for (let b = 0; b < elementBlocks; b++) {
    const info = fields(elementLines[at++]);
    const type = integer(info[2], 'an element type');
    const size = integer(info[3], 'an element block size');
    const body = elementLines.slice(at, at + size);
    at += size;
    if (body.length !== size) {
      throw new ValidateError('an element block is shorter than it announces');
    }
    for (const line of body) {
      if (type === TETRAHEDRON) cells.push(tetrahedronNodes(line, 1));
      else note(ignored, type);
    }
  }
  return {nodes, cells, ignored};
}

/**
 * Parses an ASCII Gmsh mesh.
 * @param {string} text The contents of a .msh file.
 * @param {{orient: (boolean|undefined)}=} options `orient` (default true)
 *     reorders the vertices of negatively oriented tetrahedra so that every
 *     tetrahedron is positively oriented, which `Mesh` and `Projector`
 *     require.
 * @return {{vertices: !Array<!Array<number>>, tetrahedra:
 *     !Array<!Array<number>>, skipped: !Object<string, number>}} The mesh,
 *     and how many elements of each ignored kind the file held.
 */
export function parseGmsh(text, options = {}) {
  if (typeof text !== 'string') {
    throw new ValidateError('the mesh file must be given as a string');
  }
  const parts = sections(text);
  const format = parts.get('MeshFormat');
  if (!format) {
    throw new ValidateError('no $MeshFormat section: not a .msh file');
  }
  const [version, fileType] = fields(format[0]);
  if (fileType !== '0') {
    throw new ValidateError('binary .msh files are not supported; save the ' +
      'mesh in ASCII format (Mesh.Binary = 0)');
  }
  const [major, minor = '0'] = String(version).split('.');
  const legacy = major === '2';
  if (!legacy && !(major === '4' && Number(minor) >= 1)) {
    throw new ValidateError(`.msh version ${version} is not supported; use ` +
      'ASCII format 2.2 or 4.1');
  }
  const nodeLines = parts.get('Nodes');
  const elementLines = parts.get('Elements');
  if (!nodeLines || !elementLines) {
    throw new ValidateError('the file has no $Nodes or no $Elements section');
  }
  const {nodes, cells, ignored} = legacy ?
    readLegacy(nodeLines, elementLines) : readBlocks(nodeLines, elementLines);
  if (cells.length === 0) {
    throw new ValidateError('the file has no tetrahedra (element type 4)');
  }
  // Number from 0, in the order of the node list, the nodes that tetrahedra
  // use; nodes that only belong to the boundary elements are dropped.
  const used = new Set(cells.flat());
  for (const id of used) {
    if (!nodes.has(id)) {
      throw new ValidateError(`a tetrahedron names node ${id}, which the ` +
        'file does not define');
    }
  }
  const index = new Map();
  const vertices = [];
  for (const [id, coordinates] of nodes) {
    if (used.has(id)) {
      index.set(id, vertices.length);
      vertices.push(coordinates);
    }
  }
  const tetrahedra = cells.map((cell) => cell.map((id) => index.get(id)));
  const orient = options.orient !== false;
  if (orient) {
    for (const t of tetrahedra) {
      const det = tetDeterminant(vertices[t[0]], vertices[t[1]],
          vertices[t[2]], vertices[t[3]]);
      if (det < 0) [t[1], t[2]] = [t[2], t[1]];
    }
  }
  validateMeshInput(vertices, tetrahedra, {allowFlipped: !orient});
  return {vertices, tetrahedra, skipped: Object.fromEntries(ignored)};
}
