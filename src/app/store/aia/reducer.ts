import { CanvasType } from '../../CanvasType';
import { AutoAwesome } from '../../scripts/algorithms';
import {
  Animation,
  AnimationBlock,
  ColorAnimationBlock,
  NumberAnimationBlock,
  PathAnimationBlock,
} from '../../scripts/animations';
import { ModelUtil } from '../../scripts/common';
import {
  LayerUtil,
  VectorLayer,
} from '../../scripts/layers';
import { Path } from '../../scripts/paths';
import {
  ColorProperty,
  PathProperty,
} from '../../scripts/properties';
import { NEW_WORKSPACE, NewWorkspace } from '../actions';
import * as actions from './actions';
import * as _ from 'lodash';

/**
 * Different shape shifter app modes.
 */
export enum AppMode {
  Selection = 1,
  SplitCommands,
  SplitSubPaths,
  MorphSubPaths,
}

/**
 * A selection represents an action that is the result of a mouse click.
 */
export interface Selection {
  readonly type: SelectionType;
  readonly source: CanvasType;
  readonly subIdx: number;
  readonly cmdIdx?: number;
}

/**
 * Describes the different types of selection events.
 */
export enum SelectionType {
  // The user selected an entire subpath.
  SubPath = 1,
  // The user selected an individual segment in a subpath.
  Segment,
  // The user selected an individual point in a subpath.
  Point,
}

/**
 * A hover represents a transient action that results from a mouse movement.
 */
export interface Hover {
  readonly type: HoverType;
  readonly source: CanvasType;
  readonly subIdx: number;
  readonly cmdIdx?: number;
}

/**
 * Describes the different types of hover events.
 */
export enum HoverType {
  SubPath = 1,
  Segment,
  Point,
  Split,
  Unsplit,
  Reverse,
  ShiftBack,
  ShiftForward,
  SetFirstPosition,
}

export interface State {
  readonly layers: {
    readonly vectorLayers: ReadonlyArray<VectorLayer>;
    readonly activeVectorLayerId: string;
    readonly selectedLayerIds: Set<string>;
    readonly collapsedLayerIds: Set<string>;
    readonly hiddenLayerIds: Set<string>;
  },
  readonly timeline: {
    readonly animations: ReadonlyArray<Animation>;
    readonly selectedAnimationIds: Set<string>;
    readonly activeAnimationId: string;
    readonly selectedBlockIds: Set<string>;
  },
}

export const initialState = buildInitialState();

export function buildInitialState(): State {
  const initialVectorLayer = new VectorLayer();
  const initialAnimation = new Animation();
  return {
    layers: {
      vectorLayers: [initialVectorLayer],
      activeVectorLayerId: initialVectorLayer.id,
      selectedLayerIds: new Set<string>(),
      collapsedLayerIds: new Set<string>(),
      hiddenLayerIds: new Set<string>(),
    },
    timeline: {
      animations: [initialAnimation],
      selectedAnimationIds: new Set<string>(),
      activeAnimationId: initialAnimation.id,
      selectedBlockIds: new Set<string>(),
    },
  };
}

export function reducer(
  state = initialState,
  action: NewWorkspace | actions.Actions,
) {
  switch (action.type) {

    // Shared action to create a new workspace.
    case NEW_WORKSPACE: {
      return buildInitialState();
    }

    // Add a list of animations to the application state.
    case actions.ADD_ANIMATIONS: {
      const newAnimations = action.payload.animations;
      if (!newAnimations.length) {
        // Do nothing if the list of added animations is empty.
        return state;
      }
      const timeline = state.timeline;
      const animations = timeline.animations.concat(...newAnimations);
      let { activeAnimationId } = timeline;
      if (!activeAnimationId) {
        // Auto-activate the first new animation.
        activeAnimationId = newAnimations[0].id;
      }
      return {
        ...state,
        timeline: { ...timeline, animations, activeAnimationId },
      };
    }

    // Select an animation.
    case actions.SELECT_ANIMATION: {
      const { animationId, clearExisting } = action.payload;
      return selectAnimationId(state, animationId, clearExisting);
    }

    // Activate an animation.
    case actions.ACTIVATE_ANIMATION: {
      const { animationId } = action.payload;
      const timeline = state.timeline;
      if (animationId === timeline.activeAnimationId) {
        // Do nothing if the active animation ID hasn't changed.
        return state;
      }
      return {
        ...state,
        timeline: { ...timeline, activeAnimationId: animationId },
      };
    }

    // Replace a list of animations.
    case actions.REPLACE_ANIMATIONS: {
      const { animations: replacementAnimations } = action.payload;
      if (!replacementAnimations.length) {
        // Do nothing if the list of animations is empty.
        return state;
      }
      const timeline = state.timeline;
      const animations = timeline.animations.map(animation => {
        const replacementAnimation =
          _.find(replacementAnimations, r => r.id === animation.id);
        return replacementAnimation ? replacementAnimation : animation;
      });
      return {
        ...state,
        timeline: { ...timeline, animations },
      };
    }

    // Add an animation block to the currently active animation.
    case actions.ADD_BLOCK: {
      const { layer, propertyName, fromValue, toValue } = action.payload;
      const timeline = state.timeline;
      const animation =
        _.find(timeline.animations, anim => anim.id === timeline.activeAnimationId);
      const newBlockDuration = 100;

      // TODO: pass the active time in as an argument
      // TODO: pass the active time in as an argument
      // TODO: pass the active time in as an argument
      // TODO: pass the active time in as an argument
      // TODO: pass the active time in as an argument
      const activeTime = 0;

      // Find the right start time for the block, which should be a gap between
      // neighboring blocks closest to the active time cursor, of a minimum size.
      const blocksByLayerId = ModelUtil.getOrderedBlocksByPropertyByLayer(animation);
      const blockNeighbors = (blocksByLayerId[layer.id] || {})[propertyName] || [];
      let gaps: Array<{ start: number, end: number }> = [];
      for (let i = 0; i < blockNeighbors.length; i++) {
        gaps.push({
          start: (i === 0) ? 0 : blockNeighbors[i - 1].endTime,
          end: blockNeighbors[i].startTime,
        });
      }
      gaps.push({
        start: blockNeighbors.length ? blockNeighbors[blockNeighbors.length - 1].endTime : 0,
        end: animation.duration,
      });
      gaps = gaps
        .filter(gap => gap.end - gap.start > newBlockDuration)
        .map(gap => Object.assign(gap, {
          dist: Math.min(
            Math.abs(gap.end - activeTime),
            Math.abs(gap.start - activeTime),
          ),
        }))
        .sort((a, b) => a.dist - b.dist);

      if (!gaps.length) {
        // No available gaps, cancel.
        // TODO: show a disabled button to prevent this case?
        console.warn('Ignoring failed attempt to add animation block');
        return state;
      }

      let startTime = Math.max(activeTime, gaps[0].start);
      const endTime = Math.min(startTime + newBlockDuration, gaps[0].end);
      if (endTime - startTime < newBlockDuration) {
        startTime = endTime - newBlockDuration;
      }

      // Generate the new block.
      const property = layer.animatableProperties.get(propertyName);

      // TODO: clone the current rendered property value and set the from/to values appropriately
      // TODO: clone the current rendered property value and set the from/to values appropriately
      // TODO: clone the current rendered property value and set the from/to values appropriately
      // TODO: clone the current rendered property value and set the from/to values appropriately
      // TODO: clone the current rendered property value and set the from/to values appropriately
      // const valueAtCurrentTime =
      //   this.studioState_.animationRenderer
      //     .getLayerPropertyValue(layer.id, propertyName);

      const newBlockArgs = {
        layerId: layer.id,
        animationId: timeline.activeAnimationId,
        propertyName,
        startTime,
        endTime,
        fromValue,
        toValue,
      };

      let newBlock: AnimationBlock;
      if (property instanceof PathProperty) {
        newBlock = new PathAnimationBlock(newBlockArgs);
      } else if (property instanceof ColorProperty) {
        newBlock = new ColorAnimationBlock(newBlockArgs);
      } else {
        newBlock = new NumberAnimationBlock(newBlockArgs);
      }

      const animations = timeline.animations.map(anim => {
        if (anim.id !== animation.id) {
          return anim;
        }
        anim = anim.clone();
        anim.blocks = anim.blocks.concat(newBlock);
        return anim;
      });

      // Auto-select the new animation block.
      state = selectBlockId(state, newBlock.id, true /* clearExisting */);
      return {
        ...state,
        timeline: { ...timeline, animations },
      };
    }

    // Select an animation block.
    case actions.SELECT_BLOCK: {
      const { blockId, clearExisting } = action.payload;
      return selectBlockId(state, blockId, clearExisting);
    }

    // Replace a list of animation blocks.
    case actions.REPLACE_BLOCKS: {
      const { blocks } = action.payload;
      if (!blocks.length) {
        // Do nothing if the list of blocks is empty.
        return state;
      }
      const blockMap = new Map<string, AnimationBlock[]>();
      for (const block of blocks) {
        if (blockMap.has(block.animationId)) {
          const blockList = blockMap.get(block.animationId);
          blockList.push(block);
          blockMap.set(block.animationId, blockList);
        } else {
          blockMap.set(block.animationId, [block]);
        }
      }
      const timeline = state.timeline;
      const animations = timeline.animations.map(animation => {
        return blockMap.has(animation.id) ? animation.clone() : animation;
      });
      blockMap.forEach((replacementBlocks, animId) => {
        const animation = _.find(animations, a => a.id === animId);
        const newBlocks = animation.blocks.slice();
        for (const block of replacementBlocks) {
          newBlocks[_.findIndex(newBlocks, b => b.id === block.id)] = block;
        }
        animation.blocks = newBlocks;
      });
      return {
        ...state,
        timeline: { ...timeline, animations },
      };
    }

    // Update a path animation block in shape shifter mode.
    case actions.UPDATE_PATH_BLOCK: {
      const { blockId, source, path } = action.payload;
      return updatePathAnimationBlock(state, blockId, source, path);
    }

    // Add layers to the tree.
    case actions.ADD_LAYERS: {
      // TODO: add the layer below the currently selected layer, if one exists
      const { layers: addedLayers } = action.payload;
      if (!addedLayers.length) {
        // Do nothing if there are no layers to add.
        return state;
      }
      const addedVectorLayers = addedLayers.filter(l => l instanceof VectorLayer);
      const layers = state.layers;
      const existingVectorLayers = layers.vectorLayers.slice();
      existingVectorLayers.push(...addedVectorLayers);
      const addedNonVectorLayers = addedLayers.filter(l => !(l instanceof VectorLayer));
      const activeVectorLayerId = layers.activeVectorLayerId;
      const activeVlIndex = _.findIndex(existingVectorLayers, vl => vl.id === activeVectorLayerId);
      const vl = existingVectorLayers[activeVlIndex].clone();
      vl.children = vl.children.concat(addedNonVectorLayers);
      existingVectorLayers[activeVlIndex] = vl;
      return {
        ...state,
        layers: { ...layers, vectorLayers: existingVectorLayers },
      };
    }

    // Select a layer.
    case actions.SELECT_LAYER: {
      const { layerId, shouldToggle, clearExisting } = action.payload;
      return selectLayerId(state, layerId, shouldToggle, clearExisting);
    }

    // Clear all layer selections.
    case actions.CLEAR_LAYER_SELECTIONS: {
      const layers = state.layers;
      const selectedLayerIds = new Set<string>();
      return {
        ...state,
        layers: { ...layers, selectedLayerIds },
      };
    }

    // Expand/collapse a layer.
    case actions.TOGGLE_LAYER_EXPANSION: {
      const { layerId, recursive } = action.payload;
      const layerIds = new Set([layerId]);
      const layers = state.layers;
      if (recursive) {
        _.forEach(layers.vectorLayers, vl => {
          // Recursively expand/collapse the layer's children.
          const layer = vl.findLayerById(layerId);
          if (!layer) {
            return true;
          }
          layer.walk(l => layerIds.add(l.id));
          return false;
        });
      }
      const collapsedLayerIds = new Set(layers.collapsedLayerIds);
      if (collapsedLayerIds.has(layerId)) {
        layerIds.forEach(id => collapsedLayerIds.delete(id));
      } else {
        layerIds.forEach(id => collapsedLayerIds.add(id));
      }
      return {
        ...state,
        layers: { ...layers, collapsedLayerIds },
      };
    }

    // Show/hide a layer.
    case actions.TOGGLE_LAYER_VISIBILITY: {
      const { layerId } = action.payload;
      const layers = state.layers;
      const hiddenLayerIds = new Set(layers.hiddenLayerIds);
      if (hiddenLayerIds.has(layerId)) {
        hiddenLayerIds.delete(layerId);
      } else {
        hiddenLayerIds.add(layerId);
      }
      return {
        ...state,
        layers: { ...layers, hiddenLayerIds },
      };
    }

    // Replace a layer.
    case actions.REPLACE_LAYER: {
      const replacementLayer = action.payload.layer;
      const layers = state.layers;
      let replacementVl: VectorLayer;
      if (replacementLayer instanceof VectorLayer) {
        replacementVl = replacementLayer;
      } else {
        const vl =
          LayerUtil.findParentVectorLayer(layers.vectorLayers, replacementLayer.id);
        replacementVl = LayerUtil.replaceLayerInTree(vl, replacementLayer);
      }
      const replacementId = replacementVl.id;
      const vectorLayers =
        layers.vectorLayers.map(vl => vl.id === replacementId ? replacementVl : vl);
      return {
        ...state,
        layers: { ...layers, vectorLayers },
      };
    }

    // Delete all selected animations, blocks, and layers.
    case actions.DELETE_SELECTED_MODELS: {
      state = deleteSelectedAnimations(state);
      state = deleteSelectedBlocks(state);
      state = deleteSelectedLayers(state);
      return state;
    }

    default: {
      return state;
    }
  }
}

function selectAnimationId(state: State, animationId: string, clearExisting: boolean) {
  const layers = state.layers;
  const timeline = state.timeline;
  const oldSelectedAnimationIds = timeline.selectedBlockIds;
  const newSelectedAnimationIds = clearExisting ? new Set() : new Set(oldSelectedAnimationIds);
  newSelectedAnimationIds.add(animationId);
  if (_.isEqual(oldSelectedAnimationIds, newSelectedAnimationIds)) {
    // Do nothing if the selections haven't changed.
    return state;
  }
  // Clear any existing animation/layer selections.
  let { selectedLayerIds } = layers;
  let { selectedBlockIds } = timeline;
  if (selectedBlockIds.size) {
    selectedBlockIds = new Set<string>();
  }
  if (selectedLayerIds.size) {
    selectedLayerIds = new Set<string>();
  }
  return {
    ...state,
    layers: { ...layers, selectedLayerIds },
    timeline: { ...timeline, selectedAnimationIds: newSelectedAnimationIds, selectedBlockIds },
  };
}

function selectBlockId(state: State, blockId: string, clearExisting: boolean) {
  const layers = state.layers;
  const timeline = state.timeline;
  const oldSelectedBlockIds = timeline.selectedBlockIds;
  const newSelectedBlockIds = clearExisting ? new Set() : new Set(oldSelectedBlockIds);
  newSelectedBlockIds.add(blockId);
  if (_.isEqual(oldSelectedBlockIds, newSelectedBlockIds)) {
    // Do nothing if the selections haven't changed.
    return state;
  }
  // Clear any existing animation/layer selections.
  let { selectedLayerIds } = layers;
  let { selectedAnimationIds } = timeline;
  if (selectedAnimationIds.size) {
    selectedAnimationIds = new Set<string>();
  }
  if (selectedLayerIds.size) {
    selectedLayerIds = new Set<string>();
  }
  return {
    ...state,
    layers: { ...layers, selectedLayerIds },
    timeline: { ...timeline, selectedBlockIds: newSelectedBlockIds, selectedAnimationIds },
  };
}

function selectLayerId(
  state: State,
  layerId: string,
  shouldToggle: boolean,
  clearExisting: boolean,
) {
  const layers = state.layers;
  const selectedLayerIds = new Set(layers.selectedLayerIds);
  if (clearExisting) {
    selectedLayerIds.forEach(id => {
      if (id !== layerId) {
        selectedLayerIds.delete(id);
      }
    });
  }

  let activeVectorLayerId = layers.activeVectorLayerId;
  const parentVl = LayerUtil.findParentVectorLayer(layers.vectorLayers, layerId);
  if (clearExisting || activeVectorLayerId === parentVl.id) {
    // Only allow multi-selecting layers from the same parent vector layer.
    activeVectorLayerId = parentVl.id;
    if (shouldToggle && selectedLayerIds.has(layerId)) {
      selectedLayerIds.delete(layerId);
    } else {
      selectedLayerIds.add(layerId);
    }
  }

  // Clear any existing animation/block selections.
  const timeline = state.timeline;
  let { selectedAnimationIds, selectedBlockIds } = timeline;
  if (selectedAnimationIds.size) {
    selectedAnimationIds = new Set<string>();
  }
  if (selectedBlockIds.size) {
    selectedBlockIds = new Set<string>();
  }

  return {
    ...state,
    layers: { ...layers, selectedLayerIds, activeVectorLayerId },
    timeline: { ...timeline, selectedAnimationIds, selectedBlockIds },
  };
}

function deleteSelectedAnimations(state: State) {
  const timeline = state.timeline;
  const { selectedAnimationIds } = timeline;
  if (!selectedAnimationIds.size) {
    // Do nothing if there are no selected animations;
    return state;
  }
  const animations = timeline.animations.filter(animation => {
    return !selectedAnimationIds.has(animation.id);
  });
  if (!animations.length) {
    // Create an empty animation if the last one was deleted.
    animations.push(new Animation());
  }
  let activeAnimationId = timeline.activeAnimationId;
  if (selectedAnimationIds.has(activeAnimationId)) {
    // If the active animation was deleted, activate the first animation.
    activeAnimationId = animations[0].id;
  }
  return {
    ...state,
    timeline: {
      ...timeline,
      animations,
      activeAnimationId,
      selectedAnimationIds: new Set<string>(),
    },
  };
}

function deleteSelectedBlocks(state: State) {
  const timeline = state.timeline;
  const { selectedBlockIds } = timeline;
  if (!selectedBlockIds.size) {
    // Do nothing if there are no selected blocks;
    return state;
  }
  const animations = timeline.animations.map(animation => {
    const existingBlocks = animation.blocks;
    const newBlocks = existingBlocks.filter(b => !selectedBlockIds.has(b.id));
    if (existingBlocks.length === newBlocks.length) {
      return animation;
    }
    const clonedAnimation = animation.clone();
    clonedAnimation.blocks = newBlocks;
    return clonedAnimation;
  });
  return {
    ...state,
    timeline: {
      ...timeline,
      animations,
      selectedBlockIds: new Set<string>(),
    },
  };
}

function deleteSelectedLayers(state: State) {
  const layers = state.layers;
  const { selectedLayerIds } = layers;
  if (!selectedLayerIds.size) {
    // Do nothing if there are no layers selected.
    return state;
  }
  const vectorLayers = layers.vectorLayers.slice();
  let collapsedLayerIds = new Set(layers.collapsedLayerIds);
  let hiddenLayerIds = new Set(layers.hiddenLayerIds);
  selectedLayerIds.forEach(layerId => {
    const parentVl = LayerUtil.findParentVectorLayer(vectorLayers, layerId);
    if (parentVl) {
      const vlIndex = _.findIndex(vectorLayers, vl => vl.id === parentVl.id);
      if (parentVl.id === layerId) {
        // Remove the selected vector from the list of vectors.
        vectorLayers.splice(vlIndex, 1);
      } else {
        // Remove the layer node from the parent vector.
        vectorLayers[vlIndex] = LayerUtil.removeLayerFromTree(parentVl, layerId);
      }
      collapsedLayerIds.delete(layerId);
      hiddenLayerIds.delete(layerId);
    }
  });
  if (collapsedLayerIds.size === layers.collapsedLayerIds.size) {
    collapsedLayerIds = layers.collapsedLayerIds;
  }
  if (hiddenLayerIds.size === layers.hiddenLayerIds.size) {
    hiddenLayerIds = layers.hiddenLayerIds;
  }
  if (!vectorLayers.length) {
    // Create an empty vector layer if the last one was deleted.
    vectorLayers.push(new VectorLayer());
  }
  let { activeVectorLayerId } = layers;
  if (!_.find(vectorLayers, vl => vl.id === activeVectorLayerId)) {
    // If the active vector layer ID has been deleted, make
    // the first vector layer active instead.
    activeVectorLayerId = vectorLayers[0].id;
  }
  return {
    ...state,
    layers: {
      ...layers,
      vectorLayers,
      selectedLayerIds: new Set<string>(),
      collapsedLayerIds,
      hiddenLayerIds,
      activeVectorLayerId,
    },
  };
}

/**
  * Toggles the specified shape shifter selections. If a selection exists, all selections
  * will be removed from the list. Otherwise, they will be added to the list of selections.
  * By default, all other selections from the list will be cleared.
  */
function toggleShapeShifterSelections(
  currentSelections: Selection[],
  newSelections: Selection[],
  appendToList = false,
) {
  const matchingSelections = _.remove(currentSelections, currSel => {
    // Remove any selections that are equal to a new selection.
    return newSelections.some(newSel => _.isEqual(newSel, currSel));
  });
  if (!matchingSelections.length) {
    // If no selections were removed, then add all of the selections to the list.
    currentSelections.push(...newSelections);
  }
  if (!appendToList) {
    // If we aren't appending multiple selections at a time, then clear
    // any previous selections from the list.
    _.remove(currentSelections, currSel => {
      return newSelections.every(newSel => !_.isEqual(currSel, newSel));
    });
  }
  return currentSelections;
}

/**
 * Updates the path command at the specified sub path index. The path's previous
 * conversions will be removed and an attempt to make the path compatible with
 * its opposite path layer will be made.
 */
function updatePathAnimationBlock(
  state: State,
  blockId: string,
  source: CanvasType,
  path: Path,
) {
  const { timeline } = state;
  const animations = timeline.animations.slice();
  const { activeAnimationId } = timeline;
  const activeAnimationIndex = _.findIndex(animations, a => a.id === activeAnimationId);
  const activeAnimation = animations[activeAnimationIndex];
  const activeAnimationBlocks = activeAnimation.blocks.slice();
  const blockIndex = _.findIndex(activeAnimationBlocks, b => b.id === blockId);
  const block = activeAnimationBlocks[blockIndex];

  // Remove any existing conversions and collapsing sub paths from the path.
  const pathMutator = path.mutate();
  path.getSubPaths().forEach((_, subIdx) => {
    pathMutator.unconvertSubPath(subIdx);
  });
  path = pathMutator.deleteCollapsingSubPaths().build();

  const getBlockPathFn = (t: CanvasType) => {
    return t === CanvasType.Start ? block.fromValue : block.toValue;
  };
  const setBlockPathFn = (t: CanvasType, p: Path) => {
    if (t === CanvasType.Start) {
      block.fromValue = p;
    } else {
      block.toValue = p;
    }
  };

  const oppSource = source === CanvasType.Start ? CanvasType.End : CanvasType.Start;
  let oppPath = getBlockPathFn(oppSource);
  if (oppPath) {
    oppPath = oppPath.mutate().deleteCollapsingSubPaths().build();
    const numSubPaths = path.getSubPaths().length;
    const numOppSubPaths = oppPath.getSubPaths().length;
    if (numSubPaths !== numOppSubPaths) {
      const pathToChange = numSubPaths < numOppSubPaths ? path : oppPath;
      const oppPathToChange = numSubPaths < numOppSubPaths ? oppPath : path;
      const minIdx = Math.min(numSubPaths, numOppSubPaths);
      const maxIdx = Math.max(numSubPaths, numOppSubPaths);
      const mutator = pathToChange.mutate();
      for (let i = minIdx; i < maxIdx; i++) {
        // TODO: allow the user to specify the location of collapsing paths?
        const pole = oppPathToChange.getPoleOfInaccessibility(i);
        mutator.addCollapsingSubPath(
          pole, oppPathToChange.getSubPaths()[i].getCommands().length);
      }
      if (numSubPaths < numOppSubPaths) {
        path = mutator.build();
      } else {
        oppPath = mutator.build();
      }
    }
    for (let subIdx = 0; subIdx < Math.max(numSubPaths, numOppSubPaths); subIdx++) {
      const numCmds = path.getSubPaths()[subIdx].getCommands().length;
      const numOppCommands = oppPath.getSubPaths()[subIdx].getCommands().length;
      if (numCmds === numOppCommands) {
        // Only auto convert when the number of commands in both canvases
        // are equal. Otherwise we'll wait for the user to add more points.
        const autoConvertResults = AutoAwesome.autoConvert(
          subIdx,
          path,
          oppPath.mutate().unconvertSubPath(subIdx).build(),
        );
        path = autoConvertResults.from;

        // This is the one case where a change in one canvas type's vector layer
        // will cause corresponding changes to be made in the opposite canvas type's
        // vector layer.
        oppPath = autoConvertResults.to;
      }
    }
  }
  setBlockPathFn(source, path);
  setBlockPathFn(oppSource, oppPath);

  activeAnimationBlocks[blockIndex] = block;
  activeAnimation.blocks = activeAnimationBlocks;
  animations[activeAnimationIndex] = activeAnimation;
  return { ...state, animations };
}
