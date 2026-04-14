import { useState, useRef, useCallback } from 'react';
import { VoxelEngine } from '../services/VoxelEngine';
import { ProjectType, AppState, ArtStyle, SceneConfig, GenerationConfig, CADTool, CADPlane } from '../types';


export function useStudioEngine() {
  const engineRef = useRef<VoxelEngine | null>(null);
  const [activeProject, setActiveProject] = useState<ProjectType>(ProjectType.SANDBOX);
  const [appState, setAppState] = useState<AppState>(AppState.EDITING);
  const [voxelCount, setVoxelCount] = useState<number>(0);
  const [isGenerating, setIsGenerating] = useState(false);
  
  const [genConfig, setGenConfig] = useState<GenerationConfig>({
    style: ArtStyle.CYBERPUNK,
    density: 5,
    usePhysics: true,
    cadTool: CADTool.NONE,
    cadPlane: CADPlane.XZ,
    extrusion: 0,
  });


  const [sceneConfig, setSceneConfig] = useState<SceneConfig>({
    theme: 'grid',
    ambientIntensity: 0.8,
    useGrid: true,
  });

  const handleProjectSwitch = useCallback((type: ProjectType) => {
    setActiveProject(type);
    engineRef.current?.setProjectType(type);
  }, []);

  const handleUpdateGenConfig = useCallback((updates: Partial<GenerationConfig>) => {
    setGenConfig(prev => ({ ...prev, ...updates }));
  }, []);

  const handleUpdateSceneConfig = useCallback((updates: Partial<SceneConfig>) => {
    setSceneConfig(prev => ({ ...prev, ...updates }));
  }, []);

  return {
    engineRef,
    activeProject,
    setActiveProject: handleProjectSwitch,
    appState,
    setAppState,
    voxelCount,
    setVoxelCount,
    isGenerating,
    setIsGenerating,
    genConfig,
    setGenConfig: handleUpdateGenConfig,
    sceneConfig,
    setSceneConfig: handleUpdateSceneConfig,
  };
}
