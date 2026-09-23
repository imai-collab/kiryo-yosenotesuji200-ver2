/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import confetti from 'canvas-confetti';
import {
  Trophy, RotateCcw, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  Info, AlertCircle, Upload, Plus, Loader2, Edit2, Check, ArrowUp, ArrowDown,
  Trash2, ListOrdered, Copy, ClipboardCopy, Download, Settings, X, Menu,
  Eye, Image, FileImage, ExternalLink
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from '@google/genai';
import { Color, Position, Move, Problem, DataSet } from './types';
import {
  Shogi, Piece, PIECE_NAMES, fillGoteHand, attachAnswerImages,
  applyMoveToShogi, cloneShogi, compressImage, getLegalMoves, findBestDefenderMove,
  formatMovesToJapanese
} from './lib/shogiUtils';
import { getIDBValue, setIDBValue } from './lib/db';
import problemsData from './data/problems.json';
import datasetsJson from './data/datasets.json';

const INITIAL_PROBLEMS: Problem[] = (problemsData as any).problems || ((problemsData as any).length ? problemsData : []) as Problem[];

export default function App() {
  const defaultTitle = (problemsData as any).appTitle || '詰将棋マスター';
  const defaultClearUrl = (problemsData as any).clearUrl || 'https://ais-pre-x5hnwaz6bcxstyuj6qxrfz-87151204104.asia-northeast1.run.app/complete?book=01';
  const [appTitle, setAppTitle] = useState(defaultTitle);
  const [clearUrl, setClearUrl] = useState<string>(defaultClearUrl);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [tempTitle, setTempTitle] = useState('');

  const handleTitleSave = () => {
    if (tempTitle.trim()) {
      const newTitle = tempTitle.trim();
      setAppTitle(newTitle);
      localStorage.setItem('tsumeShogiAppTitle', newTitle);
      fetch('/api/problems', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appTitle: newTitle, clearUrl, problems })
      }).catch(e => console.error("Failed to save title", e));
    }
    setIsEditingTitle(false);
  };

  const [problems, setProblems] = useState<Problem[]>([]);
  const [savedDataSets, setSavedDataSets] = useState<DataSet[]>([]);
  const [isLoadingProblems, setIsLoadingProblems] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [currentProblemIndex, setCurrentProblemIndex] = useState(0);
  const [shogi, setShogi] = useState<any>(null);
  const [selectedSquare, setSelectedSquare] = useState<Position | null>(null);
  const [selectedHandPiece, setSelectedHandPiece] = useState<{ piece: string; color: Color } | null>(null);
  const [message, setMessage] = useState<string>('あなたの番です。');
  const [showCorrectSplash, setShowCorrectSplash] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);
  const [moveHistory, setMoveHistory] = useState<Move[]>([]);
  const [isGoteManualEntry, setIsGoteManualEntry] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingPromotionMove, setPendingPromotionMove] = useState<Move | null>(null);
  const [sfenHistory, setSfenHistory] = useState<string[]>([]);
  const [failedProblemIds, setFailedProblemIds] = useState<number[]>([]);
  const [isTimerReviewPhase, setIsTimerReviewPhase] = useState(false);
  const [resetCounts, setResetCounts] = useState<Record<number, number>>({});
  const [resetTrigger, setResetTrigger] = useState(0);
  const [solvedAiMovesMap, setSolvedAiMovesMap] = useState<Record<string, Move[]>>({});
  const [preferredAiMovesMap, setPreferredAiMovesMap] = useState<Record<string, Move>>({});
  const [solvedProblems, setSolvedProblems] = useState<number[]>([]);
  const [answerImagesMap, setAnswerImagesMap] = useState<Record<string, string>>({});

  const saveAnswerImagesMap = async (newMap: Record<string, string>) => {
    setAnswerImagesMap(newMap);
    try {
      await setIDBValue('tsumeShogiAnswerImages', newMap);
    } catch (e) {}
    try {
      localStorage.setItem('tsumeShogiAnswerImages', JSON.stringify(newMap));
    } catch (e) {}
    fetch('/api/answer-images', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newMap)
    }).catch(() => {});
  };
  
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const jsonFileInputRef = useRef<HTMLInputElement>(null);
  const datasetsJsonFileInputRef = useRef<HTMLInputElement>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{ message: string, onConfirm: () => void } | null>(null);
  const [alertDialog, setAlertDialog] = useState<string | null>(null);
  const [sfenInputDialog, setSfenInputDialog] = useState(false);
  const [sfenInput, setSfenInput] = useState('');
  const [editTool, setEditTool] = useState<{ kind: string, color: Color } | 'eraser' | null>(null);
  const [isToolbarOpen, setIsToolbarOpen] = useState(false);
  const [showStartupModal, setShowStartupModal] = useState(true);
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [showAnswerModal, setShowAnswerModal] = useState(false);
  const [showSolutionModal, setShowSolutionModal] = useState(false);
  const answerFileInputRef = useRef<HTMLInputElement>(null);
  const editAnswerFileInputRef = useRef<HTMLInputElement>(null);

  const saveProblemsData = async (newProblems: Problem[], currentTitle = appTitle, currentClearUrl = clearUrl) => {
    setProblems(newProblems);
    try {
      await setIDBValue('tsumeShogiProblems', newProblems);
    } catch (e) {
      console.warn("Could not save to IndexedDB:", e);
    }

    try {
      localStorage.setItem('tsumeShogiProblems', JSON.stringify(newProblems));
      if (currentClearUrl) {
        localStorage.setItem('tsumeShogiClearUrl', currentClearUrl);
      }
    } catch (e) {
      console.warn("Could not save to localStorage (quota exceeded):", e);
    }

    try {
      await fetch('/api/problems', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appTitle: currentTitle, clearUrl: currentClearUrl, problems: newProblems })
      });
    } catch (e) {
      console.error("Failed to save problems to API:", e);
    }
  };

  const handleAnswerImageUpload = async (file: File) => {
    if (!file) return;
    try {
      setAlertDialog('画像を処理・圧縮しています...');
      const dataUrl = await compressImage(file);
      const targetProb = problems[currentProblemIndex];
      if (!targetProb) return;

      const updated = [...problems];
      updated[currentProblemIndex] = {
        ...targetProb,
        answerImageUrl: dataUrl,
      };

      const newMap = { ...answerImagesMap };
      if (targetProb.id) newMap[`id_${targetProb.id}`] = dataUrl;
      if (targetProb.title) newMap[`title_${targetProb.title}`] = dataUrl;
      if (targetProb.initialSfen) newMap[`sfen_${targetProb.initialSfen}`] = dataUrl;
      newMap[`idx_${currentProblemIndex}`] = dataUrl;

      await saveAnswerImagesMap(newMap);
      await saveProblemsData(updated);
      setAlertDialog('解答画像を登録し、保存しました。');
    } catch (e) {
      console.error("Image upload failed:", e);
      setAlertDialog('解答画像の読み込みに失敗しました。');
    }
  };

  const handleDeleteAnswerImage = () => {
    setConfirmDialog({
      message: 'この問題の解答画像を削除しますか？',
      onConfirm: async () => {
        const targetProb = problems[currentProblemIndex];
        if (!targetProb) return;

        const updated = [...problems];
        const newProb = { ...targetProb };
        delete newProb.answerImageUrl;
        updated[currentProblemIndex] = newProb;

        const newMap = { ...answerImagesMap };
        if (targetProb.id) delete newMap[`id_${targetProb.id}`];
        if (targetProb.title) delete newMap[`title_${targetProb.title}`];
        if (targetProb.initialSfen) delete newMap[`sfen_${targetProb.initialSfen}`];
        delete newMap[`idx_${currentProblemIndex}`];

        await saveAnswerImagesMap(newMap);
        await saveProblemsData(updated);
        setAlertDialog('解答画像を削除しました。');
      }
    });
  };
  
  const [isRandomOrder, setIsRandomOrder] = useState<boolean>(() => {
    return localStorage.getItem('tsumeShogiRandomOrder') === 'true';
  });

  const [timerRemaining, setTimerRemaining] = useState<number | null>(null);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [showTimerFinished, setShowTimerFinished] = useState(false);

  useEffect(() => {
    let intervalId: any;
    if (isTimerRunning && timerRemaining !== null && timerRemaining > 0) {
      intervalId = setInterval(() => {
        setTimerRemaining((prev) => {
          if (prev === null) return null;
          if (prev <= 1) {
            setIsTimerRunning(false);
            setShowTimerFinished(true);
            return null;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(intervalId);
  }, [isTimerRunning, timerRemaining]);

  const startTimer = () => {
    setTimerRemaining(300); // 5 minutes
    setIsTimerRunning(true);
    setShowTimerFinished(false);
    setFailedProblemIds([]);
    setIsTimerReviewPhase(false);
    setResetTrigger(prev => prev + 1);
  };

  const stopTimer = () => {
    setIsTimerRunning(false);
    setTimerRemaining(null);
  };

  const loadDataSetFromStartup = async (dataset: DataSet) => {
    const problemsWithImages = attachAnswerImages(dataset.problems, answerImagesMap);
    setProblems(problemsWithImages);
    setAppTitle(dataset.appTitle);
    localStorage.setItem('tsumeShogiAppTitle', dataset.appTitle);
    
    const nextClearUrl = dataset.clearUrl || defaultClearUrl;
    setClearUrl(nextClearUrl);
    localStorage.setItem('tsumeShogiClearUrl', nextClearUrl);

    const shouldRandom = localStorage.getItem('tsumeShogiRandomOrder') === 'true';
    if (shouldRandom && problemsWithImages.length > 0) {
      setCurrentProblemIndex(Math.floor(Math.random() * problemsWithImages.length));
    } else {
      setCurrentProblemIndex(0);
    }
    
    setResetTrigger(prev => prev + 1);
    
    saveProblemsData(problemsWithImages, dataset.appTitle, nextClearUrl);

    setAlertDialog('データを読み込みました。');
    setShowStartupModal(false);
  };

  const saveCurrentDataSet = async () => {
    let currentDataToCopy = problems;
    if (shogi) {
      const currentSfen = shogi.toSFENString(1);
      currentDataToCopy = [...problems];
      currentDataToCopy[currentProblemIndex] = {
        ...currentProblem,
        initialSfen: currentSfen
      };
    }

    const newDataSet: DataSet = {
      id: Date.now().toString(),
      title: `${appTitle} (${new Date().toLocaleDateString()})`,
      appTitle: appTitle,
      clearUrl: clearUrl,
      problems: currentDataToCopy,
      timestamp: Date.now()
    };

    const updated = [newDataSet, ...savedDataSets];
    setSavedDataSets(updated);
    localStorage.setItem('tsumeShogiSavedDataSets', JSON.stringify(updated));

    try {
      await fetch('/api/datasets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
    } catch (e) {
      console.error("Failed to save datasets to server", e);
    }

    setProblems(currentDataToCopy);
    setAlertDialog('現在のデータをアプリ内に保存しました！');
  };

  const loadDataSet = (dataset: DataSet) => {
    setConfirmDialog({
      message: `「${dataset.title}」を読み込みますか？現在のデータは上書きされます。`,
      onConfirm: async () => {
        const problemsWithImages = attachAnswerImages(dataset.problems, answerImagesMap);
        setProblems(problemsWithImages);
        setAppTitle(dataset.appTitle);
        localStorage.setItem('tsumeShogiAppTitle', dataset.appTitle);
        
        const nextClearUrl = dataset.clearUrl || defaultClearUrl;
        setClearUrl(nextClearUrl);
        localStorage.setItem('tsumeShogiClearUrl', nextClearUrl);

        const shouldRandom = localStorage.getItem('tsumeShogiRandomOrder') === 'true';
        if (shouldRandom && problemsWithImages.length > 0) {
          setCurrentProblemIndex(Math.floor(Math.random() * problemsWithImages.length));
        } else {
          setCurrentProblemIndex(0);
        }
        
        setResetTrigger(prev => prev + 1);
        
        saveProblemsData(problemsWithImages, dataset.appTitle, nextClearUrl);

        setAlertDialog('データを読み込みました。');
      }
    });
  };

  const deleteDataSet = async (datasetId: string) => {
    setConfirmDialog({
      message: 'この保存データを削除しますか？',
      onConfirm: async () => {
        const updated = savedDataSets.filter(ds => ds.id !== datasetId);
        setSavedDataSets(updated);
        localStorage.setItem('tsumeShogiSavedDataSets', JSON.stringify(updated));

        try {
          await fetch('/api/datasets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updated)
          });
        } catch (e) {
          console.error("Failed to delete dataset on server", e);
        }
      }
    });
  };

  const moveDataSetUp = async (index: number) => {
    if (index <= 0 || index >= savedDataSets.length) return;
    const updated = [...savedDataSets];
    const temp = updated[index];
    updated[index] = updated[index - 1];
    updated[index - 1] = temp;

    setSavedDataSets(updated);
    localStorage.setItem('tsumeShogiSavedDataSets', JSON.stringify(updated));

    try {
      await fetch('/api/datasets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
    } catch (e) {
      console.error("Failed to reorder datasets on server", e);
    }
  };

  const moveDataSetDown = async (index: number) => {
    if (index < 0 || index >= savedDataSets.length - 1) return;
    const updated = [...savedDataSets];
    const temp = updated[index];
    updated[index] = updated[index + 1];
    updated[index + 1] = temp;

    setSavedDataSets(updated);
    localStorage.setItem('tsumeShogiSavedDataSets', JSON.stringify(updated));

    try {
      await fetch('/api/datasets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
    } catch (e) {
      console.error("Failed to reorder datasets on server", e);
    }
  };

  useEffect(() => {
    const fetchProblems = async () => {
      let serverImages: Record<string, string> = {};
      try {
        const res = await fetch('/api/answer-images');
        if (res.ok) {
          serverImages = await res.json();
        }
      } catch (e) {}

      let idbImages: Record<string, string> = {};
      try {
        const idbVal = await getIDBValue<Record<string, string>>('tsumeShogiAnswerImages');
        if (idbVal && typeof idbVal === 'object') idbImages = idbVal;
      } catch (e) {}

      let localImages: Record<string, string> = {};
      try {
        const savedImg = localStorage.getItem('tsumeShogiAnswerImages');
        if (savedImg) localImages = JSON.parse(savedImg);
      } catch (e) {}

      const combinedImageMap = { ...serverImages, ...idbImages, ...localImages };
      setAnswerImagesMap(combinedImageMap);

      let apiProblems: Problem[] | null = null;
      let apiAppTitle: string | null = null;
      let apiClearUrl: string | null = null;
      try {
        const res = await fetch('/api/problems');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            apiProblems = data;
          } else if (data && data.problems && data.problems.length > 0) {
            apiProblems = data.problems;
            if (data.appTitle) apiAppTitle = data.appTitle;
            if (data.clearUrl) apiClearUrl = data.clearUrl;
          }
        }
      } catch (e) {
        console.error("Failed to fetch problems from API", e);
      }

      if (apiAppTitle) {
        setAppTitle(apiAppTitle);
        localStorage.setItem('tsumeShogiAppTitle', apiAppTitle);
      } else {
        const localTitle = localStorage.getItem('tsumeShogiAppTitle');
        if (localTitle) setAppTitle(localTitle);
      }

      if (apiClearUrl) {
        setClearUrl(apiClearUrl);
        localStorage.setItem('tsumeShogiClearUrl', apiClearUrl);
      } else {
        const localClearUrl = localStorage.getItem('tsumeShogiClearUrl');
        if (localClearUrl) setClearUrl(localClearUrl);
      }

      let idbProblems: Problem[] | null = null;
      try {
        idbProblems = await getIDBValue<Problem[]>('tsumeShogiProblems');
      } catch (e) {
        console.warn("Failed to read from IndexedDB", e);
      }

      const saved = localStorage.getItem('tsumeShogiProblems');
      let localProblems: Problem[] | null = null;
      if (saved) {
        try {
          localProblems = JSON.parse(saved);
          if (!Array.isArray(localProblems) && (localProblems as any).problems) {
            localProblems = (localProblems as any).problems;
          }
        } catch (e) {
          console.error("Failed to parse saved problems", e);
        }
      }

      try {
        const dsRes = await fetch('/api/datasets');
        let fetchedDataSets: any[] = [];
        if (dsRes.ok) {
          const dsData = await dsRes.json();
          if (Array.isArray(dsData)) {
            fetchedDataSets = dsData;
          }
        }
        
        const localSources = Array.isArray(datasetsJson) ? datasetsJson : [];
        const mergedMap = new Map();
        
        localSources.forEach((ds: any) => {
          if (ds && ds.id) mergedMap.set(ds.id, ds);
        });
        
        fetchedDataSets.forEach((ds: any) => {
          if (ds && ds.id) mergedMap.set(ds.id, ds);
        });
        
        const finalDatasets = Array.from(mergedMap.values());
        
        if (finalDatasets.length > 0) {
          setSavedDataSets(finalDatasets);
          localStorage.setItem('tsumeShogiSavedDataSets', JSON.stringify(finalDatasets));
        } else {
          const savedSets = localStorage.getItem('tsumeShogiSavedDataSets');
          if (savedSets) {
            try {
              const parsed = JSON.parse(savedSets);
              setSavedDataSets(parsed);
            } catch (e) {
              console.error(e);
            }
          }
        }
      } catch (e) {
        console.error("Failed to fetch datasets", e);
        const localSources = Array.isArray(datasetsJson) ? datasetsJson : [];
        const mergedMap = new Map();
        localSources.forEach((ds: any) => {
          if (ds && ds.id) mergedMap.set(ds.id, ds);
        });
        
        const savedSets = localStorage.getItem('tsumeShogiSavedDataSets');
        if (savedSets) {
          try {
            const parsed = JSON.parse(savedSets);
            if (Array.isArray(parsed)) {
              parsed.forEach((ds) => {
                if (ds && ds.id) mergedMap.set(ds.id, ds);
              });
            }
          } catch (err) {}
        }
        setSavedDataSets(Array.from(mergedMap.values()));
      }

      const baseList = (apiProblems && apiProblems.length > 0) ? apiProblems :
                       (idbProblems && idbProblems.length > 0) ? idbProblems :
                       (localProblems && localProblems.length > 0) ? localProblems :
                       INITIAL_PROBLEMS;

      const allSources = [apiProblems, idbProblems, localProblems].filter(Boolean) as Problem[][];
      const mergedProblems = baseList.map((prob, idx) => {
        let answerImageUrl = prob.answerImageUrl;
        if (!answerImageUrl) {
          for (const source of allSources) {
            const match = source.find(p => p.id === prob.id || p.title === prob.title || source.indexOf(p) === idx);
            if (match && match.answerImageUrl) {
              answerImageUrl = match.answerImageUrl;
              break;
            }
          }
        }
        if (!answerImageUrl && combinedImageMap) {
          answerImageUrl = combinedImageMap[`id_${prob.id}`] ||
                           (prob.title ? combinedImageMap[`title_${prob.title}`] : undefined) ||
                           (prob.initialSfen ? combinedImageMap[`sfen_${prob.initialSfen}`] : undefined) ||
                           combinedImageMap[`idx_${idx}`];
        }
        return {
          ...prob,
          answerImageUrl
        };
      });

      setProblems(mergedProblems);
      let loadedProblems = mergedProblems;

      setIDBValue('tsumeShogiProblems', mergedProblems).catch(() => {});
      try {
        localStorage.setItem('tsumeShogiProblems', JSON.stringify(mergedProblems));
      } catch (e) {}

      fetch('/api/problems', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appTitle: apiAppTitle || defaultTitle, problems: mergedProblems })
      }).catch(() => {});
      
      const shouldRandom = localStorage.getItem('tsumeShogiRandomOrder') === 'true';
      if (shouldRandom && loadedProblems.length > 0) {
        setCurrentProblemIndex(Math.floor(Math.random() * loadedProblems.length));
      }
      
      setIsLoadingProblems(false);
    };
    fetchProblems();
  }, []);

  useEffect(() => {
    if (isLoadingProblems || problems.length === 0) return;

    const timer = setTimeout(async () => {
      setIsSaving(true);

      try {
        await setIDBValue('tsumeShogiProblems', problems);
      } catch (e) {}

      try {
        localStorage.setItem('tsumeShogiProblems', JSON.stringify(problems));
      } catch (e) {
        console.warn("Could not cache problems to localStorage (quota exceeded):", e);
      }
      
      fetch('/api/problems', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appTitle, problems })
      })
      .then(res => {
        if (!res.ok) throw new Error("Save failed");
        return res.json();
      })
      .catch(e => {
        console.error("Failed to save problems to API", e);
      })
      .finally(() => {
        setTimeout(() => setIsSaving(false), 800);
      });
    }, 1000);

    return () => clearTimeout(timer);
  }, [problems, isLoadingProblems, appTitle]);

  const currentProblem = problems[currentProblemIndex];

  const goToNextProblem = useCallback(() => {
    if (isRandomOrder) {
      const unsolvedEntries = problems
        .map((p, idx) => ({ idx, id: p.id, resets: resetCounts[p.id] || 0 }))
        .filter(entry => !solvedProblems.includes(entry.id) && entry.idx !== currentProblemIndex);

      if (unsolvedEntries.length > 0) {
        const minResets = Math.min(...unsolvedEntries.map(e => e.resets));
        const candidateIndices = unsolvedEntries.filter(e => e.resets === minResets).map(e => e.idx);
        const randomIndex = candidateIndices[Math.floor(Math.random() * candidateIndices.length)];
        setCurrentProblemIndex(randomIndex);
      } else {
        const allIndices = problems.map((_, i) => i).filter(i => i !== currentProblemIndex);
        if (allIndices.length > 0) {
           setCurrentProblemIndex(allIndices[Math.floor(Math.random() * allIndices.length)]);
        } else {
           setCurrentProblemIndex(prev => Math.min(problems.length - 1, prev + 1));
        }
      }
      return;
    }

    if (isTimerRunning) {
      if (!isTimerReviewPhase && currentProblemIndex < problems.length - 1) {
        setCurrentProblemIndex(prev => prev + 1);
      } else {
        if (!isTimerReviewPhase) {
          setIsTimerReviewPhase(true);
        }
        if (failedProblemIds.length > 0) {
          const nextFailedId = failedProblemIds[0];
          const nextIdx = problems.findIndex(p => p.id === nextFailedId);
          if (nextIdx !== -1) {
            setCurrentProblemIndex(nextIdx);
            setFailedProblemIds(prev => prev.slice(1));
          }
        }
      }
      return;
    }

    const nextUnsolvedIdx = problems.findIndex((p, idx) => idx > currentProblemIndex && !solvedProblems.includes(p.id));
    if (nextUnsolvedIdx !== -1) {
      setCurrentProblemIndex(nextUnsolvedIdx);
    } else {
      const firstUnsolvedIdx = problems.findIndex(p => !solvedProblems.includes(p.id));
      if (firstUnsolvedIdx !== -1) {
        setCurrentProblemIndex(firstUnsolvedIdx);
      } else {
        if (currentProblemIndex < problems.length - 1) {
          setCurrentProblemIndex(prev => prev + 1);
        }
      }
    }
  }, [isRandomOrder, problems, solvedProblems, currentProblemIndex, isTimerRunning, failedProblemIds, resetCounts, isTimerReviewPhase]);

  const handleAddEmptyProblem = () => {
    const newProblem: Problem = {
      id: Date.now(),
      title: `追加問題`,
      description: '新しい問題です。盤面を編集してください。',
      initialSfen: "9/9/9/9/9/9/9/9/9 b - 1",
    };
    setProblems(prev => {
      const updated = [...prev];
      updated.splice(currentProblemIndex + 1, 0, newProblem);
      return updated.map((p, i) => ({ ...p, id: i + 1 }));
    });
    setCurrentProblemIndex(currentProblemIndex + 1);
    setIsEditMode(true);
    setAlertDialog('新しい問題を追加しました。盤面を編集してください。');
  };

  const toggleEditMode = () => {
    if (isEditMode) {
      setSelectedSquare(null);
      const newSfen = shogi.toSFENString(1);
      const updatedProblems = [...problems];
      updatedProblems[currentProblemIndex] = {
        ...currentProblem,
        initialSfen: newSfen,
      };
      setProblems(updatedProblems);
      setAlertDialog(`盤面を更新しました。`);
    } else {
      setIsToolbarOpen(false);
    }
    setIsEditMode(!isEditMode);
  };

  const deleteProblem = () => {
    setConfirmDialog({
      message: 'この問題を削除しますか？',
      onConfirm: () => {
        const newProblems = problems.filter((_, idx) => idx !== currentProblemIndex);
        if (newProblems.length === 0) {
          setAlertDialog('最後の問題は削除できません。');
          return;
        }
        setProblems(newProblems);
        if (currentProblemIndex >= newProblems.length) {
          setCurrentProblemIndex(newProblems.length - 1);
        }
      }
    });
  };

  const moveProblemUp = () => {
    if (currentProblemIndex > 0) {
      const newProblems = [...problems];
      const temp = newProblems[currentProblemIndex];
      newProblems[currentProblemIndex] = newProblems[currentProblemIndex - 1];
      newProblems[currentProblemIndex - 1] = temp;
      setProblems(newProblems);
      setCurrentProblemIndex(currentProblemIndex - 1);
    }
  };

  const moveProblemDown = () => {
    if (currentProblemIndex < problems.length - 1) {
      const newProblems = [...problems];
      const temp = newProblems[currentProblemIndex];
      newProblems[currentProblemIndex] = newProblems[currentProblemIndex + 1];
      newProblems[currentProblemIndex + 1] = temp;
      setProblems(newProblems);
      setCurrentProblemIndex(currentProblemIndex + 1);
    }
  };

  const renumberProblems = () => {
    setConfirmDialog({
      message: 'すべての問題のタイトルを「第1問」「第2問」...と順番通りに振り直しますか？',
      onConfirm: () => {
        const newProblems = problems.map((p, idx) => ({
          ...p,
          id: idx + 1,
          title: `第${idx + 1}問`
        }));
        setProblems(newProblems);
        setAlertDialog('問題番号を振り直しました。');
      }
    });
  };

  const duplicateProblem = () => {
    const currentSfen = shogi.toSFENString(1);
    
    setProblems(prev => {
      const updated = [...prev];
      updated[currentProblemIndex] = {
        ...updated[currentProblemIndex],
        initialSfen: currentSfen
      };
      
      const newProblemToInsert = {
        ...updated[currentProblemIndex],
        id: Date.now(),
        title: `${updated[currentProblemIndex].title} (コピー)`
      };
      
      updated.splice(currentProblemIndex + 1, 0, newProblemToInsert);
      return updated.map((p, idx) => ({ ...p, id: idx + 1 }));
    });
    setCurrentProblemIndex(currentProblemIndex + 1);
    setAlertDialog('問題を複製しました。現在の盤面データがコピーされています。');
  };

  const copyAllData = async () => {
    let currentDataToCopy = problems;
    if (shogi) {
      const currentSfen = shogi.toSFENString(1);
      currentDataToCopy = [...problems];
      currentDataToCopy[currentProblemIndex] = {
        ...currentProblem,
        initialSfen: currentSfen
      };
      setProblems(currentDataToCopy);
    }
    
    try {
      const exportData = {
        appTitle,
        clearUrl,
        problems: currentDataToCopy
      };
      await navigator.clipboard.writeText(JSON.stringify(exportData, null, 2));
      setAlertDialog('すべての問題データをクリップボードにコピーしました！');
    } catch (err) {
      setAlertDialog('クリップボードへのコピーに失敗しました。');
    }
  };

  const handleJsonImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        let importedProblems = parsed;
        let importedTitle = null;
        let importedClearUrl = null;

        if (!Array.isArray(parsed) && parsed.problems) {
          importedProblems = parsed.problems;
          if (parsed.appTitle) importedTitle = parsed.appTitle;
          if (parsed.clearUrl) importedClearUrl = parsed.clearUrl;
        }

        if (Array.isArray(importedProblems) && importedProblems.length > 0 && typeof importedProblems[0].id !== 'undefined') {
          setConfirmDialog({
            message: 'JSONデータをインポートしますか？現在のデータはすべて上書きされます。',
            onConfirm: () => {
              setProblems(importedProblems);
              if (importedTitle) {
                setAppTitle(importedTitle);
                localStorage.setItem('tsumeShogiAppTitle', importedTitle);
              }
              if (importedClearUrl) {
                setClearUrl(importedClearUrl);
                localStorage.setItem('tsumeShogiClearUrl', importedClearUrl);
              }
              const shouldRandom = localStorage.getItem('tsumeShogiRandomOrder') === 'true';
              if (shouldRandom && importedProblems.length > 0) {
                setCurrentProblemIndex(Math.floor(Math.random() * importedProblems.length));
              } else {
                setCurrentProblemIndex(0);
              }
              setResetTrigger(prev => prev + 1);
              saveProblemsData(importedProblems, importedTitle || appTitle, importedClearUrl || clearUrl);
              setAlertDialog('データをインポートしました。');
            }
          });
        } else {
          setUploadError('無効なJSONデータです。正しい形式の問題データを含めてください。');
        }
      } catch(err) {
        setUploadError('JSONデータの読み込みに失敗しました。ファイルが破損している可能性があります。');
      }
      if (jsonFileInputRef.current) jsonFileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const copyAllDataSets = async () => {    
    try {
      await navigator.clipboard.writeText(JSON.stringify(savedDataSets, null, 2));
      setAlertDialog('保存済みの全データをクリップボードにコピーしました！');
    } catch (err) {
      setAlertDialog('クリップボードへのコピーに失敗しました。');
    }
  };

  const handleDataSetsJsonImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        
        if (Array.isArray(parsed)) {
          setConfirmDialog({
            message: '保存済みのデータセットをインポートしますか？現在の保存済みデータはすべて上書きされます。',
            onConfirm: async () => {
              setSavedDataSets(parsed);
              localStorage.setItem('tsumeShogiSavedDataSets', JSON.stringify(parsed));
              try {
                await fetch('/api/datasets', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(parsed)
                });
              } catch (e) {
                console.error("Failed to save datasets to server", e);
              }
              setAlertDialog('保存済みデータセットをインポートしました。');
            }
          });
        } else {
          setUploadError('無効なデータセットJSONデータです。');
        }
      } catch(err) {
        setUploadError('JSONデータの読み込みに失敗しました。ファイルが破損している可能性があります。');
      }
      if (datasetsJsonFileInputRef.current) datasetsJsonFileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadError(null);

    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = error => reject(error);
      });
      reader.readAsDataURL(file);
      const base64Data = await base64Promise;

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const prompt = `提供されたファイル（画像またはPDF）に含まれるすべての将棋（詰将棋や必至など）の問題を読み取り、それぞれの盤面の状態と持ち駒からSFEN形式の文字列を作成してください。
また、図の上方や周辺に問題のタイトルや説明文（例：「基本の必至形 上から押さえる１」など）が書かれている場合は、そのテキストを読み取って \`description\` として抽出してください。特にテキストが見当たらない場合は空文字列にしてください。
さらに、後手（玉方）の持ち駒について、画像内で具体的に駒の種類と数が指定されている場合（例：「後手：金、銀」「後手：なし」など）は \`goteHandSpecified\` を true とし、指定がない場合（一般的な詰将棋のように「残り全部」が暗黙の前提となっている場合）は false としてください。

結果を以下のJSON配列形式で出力してください。

PDFの場合は複数ページに複数の問題がある可能性があります。すべての問題を抽出してください。

【重要：先手と後手の駒の判定（絶対に間違えないでください）】
画像内の駒の向きで先手・後手を判断します。
1. 先手の駒（攻め方・プレイヤー）:
   - 駒の文字が「正しく（正立して）」読める。
   - 駒の五角形の尖っている方向が「上（奥）」を向いている。
   - SFENでは **大文字** で出力（例: R, B, G, S, N, L, P, +R, +B, +S, +N, +L, +P）。

2. 後手の駒（受け方・玉方）:
   - 駒の文字が「逆さま」になっている。
   - 駒の五角形の尖っている方向が「下（手前）」を向いている。
   - ※玉将（玉）は通常こちらの向きです。
   - SFENでは **小文字** で出力（例: k, r, b, g, s, n, l, p, +r, +b, +s, +n, +l, +p）。

【SFEN形式のルール】
SFEN形式の例: 7nl/1R3sk2/5pppp/9/9/9/9/9/9 b GS 1
・先手の手番として 'b' を指定します。
・持ち駒（先手）は、大文字で指定してください（例: GS）。持ち駒がない場合は '-' を指定してください。
・空白は連続するマスの数を数字で表します（1〜9）。

出力は純粋なJSON配列のみにしてください。Markdownのコードブロック（\`\`\`json ... \`\`\`）や余計な説明は一切含めないでください。
例: [{"sfen": "7nl/1R3sk2/5pppp/9/9/9/9/9/9 b GS 1", "description": "基本の必至形 上から押さえる１", "goteHandSpecified": false}]`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: {
          parts: [
            { text: prompt },
            { inlineData: { data: base64Data, mimeType: file.type } }
          ]
        }
      });

      const responseText = response.text?.trim() || "[]";
      const jsonStr = responseText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      
      let parsedResults: { sfen: string, description: string, goteHandSpecified?: boolean }[] = [];
      try {
        parsedResults = JSON.parse(jsonStr);
        if (parsedResults.length > 0 && typeof parsedResults[0] === 'string') {
          parsedResults = (parsedResults as unknown as string[]).map(sfen => ({ sfen, description: '', goteHandSpecified: false }));
        }
      } catch (e) {
        if (jsonStr.includes('/') && jsonStr.includes(' ')) {
          parsedResults = [{ sfen: jsonStr, description: '', goteHandSpecified: false }];
        } else {
          throw new Error("SFEN文字列の抽出に失敗しました。");
        }
      }

      if (!parsedResults || parsedResults.length === 0) {
        throw new Error("問題が見つかりませんでした。");
      }

      const toFullWidth = (s: string) => s.replace(/[0-9]/g, c => String.fromCharCode(c.charCodeAt(0) + 0xFEE0));
      const newProblems: Problem[] = parsedResults.map((item, index) => {
        let finalSfen = item.sfen;
        if (!item.goteHandSpecified) {
          const tempShogi = new Shogi();
          try {
            if (tempShogi.initializeFromSFENString) {
              tempShogi.initializeFromSFENString(item.sfen);
            } else {
              tempShogi.initializeFromSFEN(item.sfen);
            }
            fillGoteHand(tempShogi);
            finalSfen = tempShogi.toSFENString ? tempShogi.toSFENString(1) : tempShogi.toSFEN(1);
          } catch (err) {
            console.error("Invalid SFEN from AI:", err);
          }
        }
        
        return {
          id: Date.now() + index,
          title: `問題${toFullWidth((index + 1).toString())}`,
          description: item.description ? item.description : 'ファイルから追加された問題です。',
          initialSfen: finalSfen,
        };
      });

      setProblems(prev => {
        const updated = [...prev];
        updated.splice(currentProblemIndex + 1, 0, ...newProblems);
        return updated.map((p, i) => ({ ...p, id: i + 1 }));
      });
      setCurrentProblemIndex(currentProblemIndex + 1);
      
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err: any) {
      console.error("Upload error:", err);
      setUploadError(err.message || "ファイルの読み込みまたは解析に失敗しました。");
    } finally {
      setIsUploading(false);
    }
  };

  useEffect(() => {
    if (isGameOver && isTimerRunning) {
      if (message !== 'CORRECT') {
        setFailedProblemIds(prev => {
          if (!prev.includes(currentProblem.id)) {
            return [...prev, currentProblem.id];
          }
          return prev;
        });
        const timer = setTimeout(() => {
          goToNextProblem();
        }, 1500);
        return () => clearTimeout(timer);
      }
    }
  }, [isGameOver, isTimerRunning, message, currentProblem?.id, goToNextProblem]);

  const resetGame = useCallback(() => {
    if (!currentProblem) return;
    
    try {
      const newShogi = new Shogi();
      
      let initialSfen = currentProblem.initialSfen;
      if (initialSfen.includes(' w ')) {
        initialSfen = initialSfen.replace(' w ', ' b ');
      }
      
      try {
        if (newShogi.initializeFromSFENString) {
          newShogi.initializeFromSFENString(initialSfen);
        } else if (newShogi.initializeFromSFEN) {
          newShogi.initializeFromSFEN(initialSfen);
        }
      } catch (sfenError) {
        console.error("Invalid SFEN:", initialSfen);
        if (newShogi.initializeFromSFENString) {
          newShogi.initializeFromSFENString("9/9/9/9/9/9/9/9/9 b - 1");
        } else {
          newShogi.initializeFromSFEN("9/9/9/9/9/9/9/9/9 b - 1");
        }
        setAlertDialog(`問題「${currentProblem.title}」の盤面データが不正なため、空の盤面を表示しています。「盤面を修正」から修正してください。`);
      }
      
      setShogi(newShogi);
      setSelectedSquare(null);
      setSelectedHandPiece(null);
      setMessage('あなたの番です。');
      setIsGameOver(false);
      setIsGoteManualEntry(false);
      setMoveHistory([]);
      setError(null);
      setPendingPromotionMove(null);
      setSfenHistory([newShogi.toSFENString ? newShogi.toSFENString(1) : '']);
    } catch (e) {
      console.error("Game initialization error", e);
      setError("ゲームの初期化に失敗しました。");
    }
  }, [currentProblem]);

  const handleChangeGoteMove = useCallback(() => {
    if (moveHistory.length === 0) return;
    const isSentesTurn = moveHistory.length % 2 === 0;
    
    if (!isSentesTurn) return;

    const newMoveHistory = [...moveHistory];
    const newSfenHistory = [...sfenHistory];
    
    newMoveHistory.pop();
    newSfenHistory.pop();

    const newShogi = new Shogi();
    if (newShogi.initializeFromSFENString) {
      newShogi.initializeFromSFENString(newSfenHistory[newSfenHistory.length - 1]);
    } else {
      newShogi.initializeFromSFEN(newSfenHistory[newSfenHistory.length - 1]);
    }
    
    setSfenHistory(newSfenHistory);
    setMoveHistory(newMoveHistory);
    setShogi(newShogi);
    
    setIsGoteManualEntry(true);
    setIsGameOver(false);
    setMessage('後手の手を入力してください。');
    setSelectedSquare(null);
    setSelectedHandPiece(null);
    setPendingPromotionMove(null);
  }, [moveHistory, sfenHistory]);

  useEffect(() => {
    resetGame();
  }, [currentProblem?.id, currentProblemIndex, resetTrigger, resetGame]);

  if (isLoadingProblems) {
    return (
      <div className="min-h-screen bg-[#1A2F24] flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-amber-800 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-white font-bold">問題データを読み込み中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#1A2F24] flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl border border-red-100 text-center max-w-md">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-stone-900 mb-2">エラーが発生しました</h1>
          <p className="text-stone-800/70 mb-6">{error}</p>
          <div className="flex flex-col gap-3">
            <button onClick={() => window.location.reload()} className="bg-amber-800 text-white px-6 py-2 rounded-xl font-bold hover:bg-amber-900 transition-colors">
              再読み込み
            </button>
            <button
              onClick={() => {
                localStorage.removeItem('tsumeShogiProblems');
                fetch('/api/problems', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ appTitle: defaultTitle, problems: INITIAL_PROBLEMS })
                }).then(() => window.location.reload());
              }}
              className="px-6 py-2 bg-red-50 text-red-600 rounded-xl font-bold hover:bg-red-100 transition-colors text-sm"
            >
              データを初期化して復旧する
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!shogi) {
    return (
      <div className="min-h-screen bg-[#1A2F24] flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-amber-800 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-white font-bold">読み込み中...</p>
        </div>
      </div>
    );
  }

  const handleSquareClick = (x: number, y: number) => {
    if (isEditMode) {
      if (editTool === 'eraser') {
        shogi.board[x - 1][y - 1] = null;
      } else if (editTool) {
        const prefix = editTool.color === Color.Black ? '+' : '-';
        shogi.board[x - 1][y - 1] = new Piece(prefix + editTool.kind);
      } else {
        if (selectedSquare) {
          if (selectedSquare.x === x && selectedSquare.y === y) {
            const piece = shogi.get(x, y);
            if (piece) {
              shogi.board[x - 1][y - 1] = new Piece(piece.color === Color.Black ? '-' + piece.kind : '+' + piece.kind);
            }
            setSelectedSquare(null);
          } else {
            const pieceToMove = shogi.get(selectedSquare.x, selectedSquare.y);
            const targetPiece = shogi.get(x, y);
            shogi.board[selectedSquare.x - 1][selectedSquare.y - 1] = targetPiece;
            shogi.board[x - 1][y - 1] = pieceToMove;
            setSelectedSquare(null);
          }
        } else {
          if (shogi.get(x, y)) {
            setSelectedSquare({ x, y });
          }
          return;
        }
      }
      setShogi(cloneShogi(shogi));
      return;
    }

    if (isGameOver || pendingPromotionMove || message === '相手が考えています...') return;

    if (selectedHandPiece) {
      const to = { x, y };
      processMove({ to, piece: selectedHandPiece.piece });
      setSelectedHandPiece(null);
      return;
    }

    if (selectedSquare) {
      if (selectedSquare.x === x && selectedSquare.y === y) {
        setSelectedSquare(null);
        return;
      }

      const piece = shogi.get(selectedSquare.x, selectedSquare.y);
      if (!piece) {
        setSelectedSquare(null);
        return;
      }

      const pieceKind = piece.kind;
      const pieceColor = piece.color;

      const move: Move = { from: selectedSquare, to: { x, y }, promote: false };
      
      const isPromotionZone = (color: Color, row: number) => color === Color.Black ? row <= 3 : row >= 7;
      const isPromoted = ["TO", "NY", "NK", "NG", "UM", "RY"].includes(pieceKind);
      const canPromote = !isPromoted && 
                         !['KI', 'OU', 'GY'].includes(pieceKind) &&
                         (isPromotionZone(pieceColor, selectedSquare.y) || isPromotionZone(pieceColor, y));
                         
      const mustPromote = canPromote && (
        (['FU', 'KY'].includes(pieceKind) && (pieceColor === Color.Black ? y === 1 : y === 9)) ||
        (pieceKind === 'KE' && (pieceColor === Color.Black ? y <= 2 : y >= 8))
      );

      if (mustPromote) {
        move.promote = true;
        processMove(move);
        setSelectedSquare(null);
      } else if (canPromote) {
        setPendingPromotionMove(move);
      } else {
        processMove(move);
        setSelectedSquare(null);
      }
    } else {
      const turnColor = isGoteManualEntry ? Color.White : Color.Black;
      const piece = shogi.get(x, y);
      if (piece && piece.color === turnColor) {
        setSelectedSquare({ x, y });
      }
    }
  };

  const handleHandClick = (piece: string, color: Color) => {
    const turnColor = isGoteManualEntry ? Color.White : Color.Black;
    if (isGameOver || color !== turnColor || message === '相手が考えています...') return;
    setSelectedSquare(null);
    setSelectedHandPiece({ piece, color });
  };

  const processMove = (move: Move) => {
    const turnColor = isGoteManualEntry ? Color.White : Color.Black;
    const opponentColor = isGoteManualEntry ? Color.Black : Color.White;

    setPendingPromotionMove(null);
    const sfenBefore = shogi.toSFENString(1);

    const legalMoves = getLegalMoves(shogi, turnColor);
    const isLegal = legalMoves.some(m => 
      m.from?.x === move.from?.x && m.from?.y === move.from?.y &&
      m.to?.x === move.to.x && m.to?.y === move.to.y &&
      m.piece === move.piece && m.promote === move.promote
    );

    if (!isLegal) {
      setMessage('その手は指せません（反則手です）。');
      setTimeout(() => setMessage(isGoteManualEntry ? '後手の手を入力してください。' : 'あなたの番です。'), 1500);
      return;
    }

    const tempShogi = cloneShogi(shogi);
    applyMoveToShogi(tempShogi, move);

    applyMoveToShogi(shogi, move);

    if (move.piece === 'FU' && shogi.isCheck(opponentColor)) {
      const oppMoves = getLegalMoves(shogi, opponentColor);
      if (oppMoves.length === 0) {
        shogi.initializeFromSFENString(sfenBefore);
        setMessage('打ち歩詰めは禁手です。');
        setTimeout(() => setMessage(isGoteManualEntry ? '後手の手を入力してください。' : 'あなたの番です。'), 2000);
        return;
      }
    }

    const newSfen = shogi.toSFENString(1);
    
    const count = sfenHistory.filter(s => s === newSfen).length;
    if (count >= 3) {
      setSfenHistory(prev => [...prev, newSfen]);
      setMoveHistory(prev => [...prev, move]);
      setShogi(cloneShogi(shogi));
      setIsGameOver(true);
      setMessage(isGoteManualEntry ? '千日手です。後手の失敗となります。' : '千日手です。攻め方の失敗となります。');
      return;
    }

    setSfenHistory(prev => [...prev, newSfen]);
    setMoveHistory(prev => [...prev, move]);
    
    const nextShogi = cloneShogi(shogi);
    setShogi(nextShogi);

    const oppMoves = getLegalMoves(nextShogi, opponentColor);
    if (oppMoves.length === 0) {
      setIsGameOver(true);
      if (turnColor === Color.White) {
        setMessage('指す手がありません。失敗です。');
      } else {
        setMessage('CORRECT');
        setPreferredAiMovesMap({});
        setSolvedProblems(prev => Array.from(new Set([...prev, currentProblem.id])));
        setSolvedAiMovesMap(prev => {
          const newMap = { ...prev };
          for (let i = 1; i < moveHistory.length; i += 2) {
            const sfen = sfenHistory[i];
            if (sfen) newMap[sfen] = [...(newMap[sfen] || []), moveHistory[i]];
          }
          return newMap;
        });
        setShowCorrectSplash(true);
        setTimeout(() => setShowCorrectSplash(false), 1000);
        confetti({
          particleCount: 150,
          spread: 70,
          origin: { y: 0.6 }
        });
      }
      return;
    }

    if (isGoteManualEntry) {
       setPreferredAiMovesMap(prev => ({ ...prev, [sfenBefore]: move }));
       setIsGoteManualEntry(false);
       setMessage('あなたの番です。');
       return;
    }

    setMessage('相手が考えています...');

    const isAlreadySolved = solvedProblems.includes(currentProblem?.id);
    const registeredSolution = isAlreadySolved ? null : currentProblem?.solution;
    let solutionGoteMove: Move | null = null;
    const senteIndex = moveHistory.length;
    const goteIndex = senteIndex + 1;

    if (registeredSolution && registeredSolution.length > goteIndex) {
      const expectedSenteMove = registeredSolution[senteIndex];
      if (expectedSenteMove) {
        const isFromMatch = (!expectedSenteMove.from && !move.from) ||
          (expectedSenteMove.from?.x === move.from?.x && expectedSenteMove.from?.y === move.from?.y);
        const isToMatch = expectedSenteMove.to.x === move.to.x && expectedSenteMove.to.y === move.to.y;
        const isPieceMatch = (expectedSenteMove.piece || undefined) === (move.piece || undefined);
        const isPromoteMatch = Boolean(expectedSenteMove.promote) === Boolean(move.promote);

        if (isFromMatch && isToMatch && isPieceMatch && isPromoteMatch) {
          solutionGoteMove = registeredSolution[goteIndex];
        }
      }
    }
    
    setTimeout(() => {
      let goteMoveToPlay: Move | null = null;

      if (solutionGoteMove) {
        const legalGoteMoves = getLegalMoves(nextShogi, Color.White);
        const isLegal = legalGoteMoves.some(m =>
          ((!m.from && !solutionGoteMove!.from) || (m.from?.x === solutionGoteMove!.from?.x && m.from?.y === solutionGoteMove!.from?.y)) &&
          m.to.x === solutionGoteMove!.to.x && m.to.y === solutionGoteMove!.to.y &&
          (m.piece || undefined) === (solutionGoteMove!.piece || undefined) &&
          Boolean(m.promote) === Boolean(solutionGoteMove!.promote)
        );
        if (isLegal) {
          goteMoveToPlay = solutionGoteMove;
        }
      }

      if (!goteMoveToPlay) {
        const defenderRes = findBestDefenderMove(nextShogi, 3, solvedAiMovesMap, preferredAiMovesMap);
        goteMoveToPlay = defenderRes.bestMove;
      }
      
      if (goteMoveToPlay) {
        applyMoveToShogi(nextShogi, goteMoveToPlay);
        const afterGoteSfen = nextShogi.toSFENString(1);
        setSfenHistory(prev => [...prev, afterGoteSfen]);
        setMoveHistory(prev => [...prev, goteMoveToPlay!]);
        
        const blackMoves = getLegalMoves(nextShogi, Color.Black);
        if (blackMoves.length === 0) {
          setIsGameOver(true);
          setMessage('指す手がありません。失敗です。');
        } else {
          setMessage('あなたの番です。');
        }
        setShogi(cloneShogi(nextShogi));
      } else {
        setIsGameOver(true);
        setMessage('CORRECT');
        setPreferredAiMovesMap({});
        setSolvedProblems(prev => Array.from(new Set([...prev, currentProblem.id])));
        setSolvedAiMovesMap(prev => {
          const newMap = { ...prev };
          const fullHistory = [...moveHistory, move];
          for (let i = 1; i < fullHistory.length; i += 2) {
            const sfen = sfenHistory[i];
            if (sfen) newMap[sfen] = [...(newMap[sfen] || []), fullHistory[i]];
          }
          return newMap;
        });
        setShowCorrectSplash(true);
        setTimeout(() => setShowCorrectSplash(false), 1000);
        confetti({
          particleCount: 150,
          spread: 70,
          origin: { y: 0.6 }
        });
      }
    }, 50);
  };

  const handleRegisterSolutionClick = () => {
    if (currentProblem?.solution && currentProblem.solution.length > 0) {
      setShowSolutionModal(true);
    } else {
      if (moveHistory.length > 0) {
        setConfirmDialog({
          message: `現在の指し手（${moveHistory.length}手）をこの問題の解答手順として登録しますか？`,
          onConfirm: async () => {
            const updated = [...problems];
            updated[currentProblemIndex] = {
              ...currentProblem,
              solution: moveHistory
            };
            await saveProblemsData(updated);
            setAlertDialog('解答手順を登録しました。先手が解答に沿った手を指したときは、後手も登録通りに応答します。');
          }
        });
      } else {
        setAlertDialog('盤面で手を動かしてから「解答登録」を押すと、その手順を解答として登録できます。');
      }
    }
  };

  const renderBoard = () => {
    const cells = [];
    for (let y = 1; y <= 9; y++) {
      for (let x = 9; x >= 1; x--) {
        const piece = shogi.get(x, y);
        const isSelected = selectedSquare?.x === x && selectedSquare?.y === y;
        const lastMove = moveHistory[moveHistory.length - 1];
        const isLastMove = lastMove?.to.x === x && lastMove?.to.y === y;

        cells.push(
          <div
            key={`${x}-${y}`}
            onClick={() => handleSquareClick(x, y)}
            className={`
              relative w-full aspect-square border border-[#4A3123] flex items-center justify-center cursor-pointer
              ${isSelected ? 'bg-blue-400/50' : isLastMove ? 'bg-blue-300/40' : 'hover:bg-black/10'}
              transition-colors duration-200
            `}
          >
            {piece && (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="w-full h-full flex items-center justify-center p-0.5 sm:p-1"
              >
                <div
                  className={`
                    w-full h-full flex items-center justify-center rounded shadow-sm
                    ${piece.color === Color.Black ? 'bg-stone-50' : 'bg-[#FDF0C8]'} border border-stone-700/50
                    transition-all duration-200
                  `}
                >
                  <span className={`
                    text-xl sm:text-2xl md:text-3xl font-bold select-none
                    ${piece.color === Color.White ? 'rotate-180' : ''}
                    ${["TO", "NY", "NK", "NG", "UM", "RY"].includes(piece.kind) ? 'text-red-700' : 'text-stone-900'}
                  `}>
                    {PIECE_NAMES[piece.kind] || piece.kind}
                  </span>
                </div>
              </motion.div>
            )}
          </div>
        );
      }
    }
    return cells;
  };

  const renderHand = (color: Color) => {
    const hand = shogi.getHandsSummary(color);
    const HAND_PIECES = ['FU', 'KY', 'KE', 'GI', 'KI', 'KA', 'HI'];
    const pieces = isEditMode
      ? HAND_PIECES.map(kind => [kind, hand[kind] || 0])
      : Object.entries(hand).filter(([_, count]) => (count as number) > 0);

    return (
      <div className="flex flex-row flex-wrap gap-1 sm:gap-2 items-center justify-center">
        {!isEditMode && pieces.length === 0 && <span className="text-black text-[10px] sm:text-sm py-2">なし</span>}
        {pieces.map(([kind, count]) => (
          <div key={kind} className="flex flex-col items-center gap-1">
            <div
              onClick={() => !isEditMode && handleHandClick(kind as string, color)}
              className={`
                relative flex items-center justify-center rounded
                ${color === Color.Black ? 'w-[10vw] max-w-[46px] h-[10vw] max-h-[46px]' : 'w-8 h-8 sm:w-10 sm:h-10'}
                cursor-pointer border border-stone-700/50 ${color === Color.Black ? 'bg-stone-50 hover:bg-white' : 'bg-[#FDF0C8] hover:bg-[#F5E2B2]'} shadow-sm
                ${selectedHandPiece?.piece === kind && selectedHandPiece?.color === color ? '!ring-2 !ring-blue-500' : ''}
                transition-all duration-200
              `}
            >
              <span className={`font-bold ${color === Color.White ? 'text-lg sm:text-xl rotate-180' : 'text-xl sm:text-2xl md:text-3xl'} text-stone-900 ${isEditMode && count === 0 ? 'opacity-30' : ''}`}>
                {PIECE_NAMES[kind as string] || kind}
              </span>
              {(count as number) > 1 && (
                <span className={`absolute -bottom-1 -right-1 text-[10px] sm:text-xs w-4 h-4 sm:w-5 sm:h-5 flex items-center justify-center rounded-full border border-white bg-stone-800 text-white`}>
                  {count as number}
                </span>
              )}
            </div>
            {isEditMode && (
              <div className="flex gap-1">
                <button 
                  onClick={() => {
                    if ((count as number) > 0) {
                      shogi.popFromHand(kind as string, color);
                      setShogi(cloneShogi(shogi));
                    }
                  }}
                  className="w-5 h-5 flex items-center justify-center bg-gray-200 hover:bg-gray-300 rounded text-xs font-bold"
                >-</button>
                <button 
                  onClick={() => {
                    shogi.pushToHand(new Piece((color === Color.Black ? '+' : '-') + kind));
                    setShogi(cloneShogi(shogi));
                  }}
                  className="w-5 h-5 flex items-center justify-center bg-gray-200 hover:bg-gray-300 rounded text-xs font-bold"
                >+</button>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="h-[100dvh] bg-[#1A2F24] text-stone-900 font-sans flex flex-col items-center overflow-hidden relative">
      {/* Timer Finished Modal */}
      <AnimatePresence>
        {showTimerFinished && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.1 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none bg-black/30 backdrop-blur-sm"
          >
            <div className="bg-red-600 border-[4px] border-red-800 rounded-2xl px-8 py-8 sm:px-12 shadow-2xl flex flex-col items-center gap-4">
              <span className="text-6xl sm:text-8xl font-black text-white tracking-widest drop-shadow-lg">終了！</span>
              <span className="text-xl sm:text-2xl font-bold text-white/90">5分が経過しました</span>
              <button 
                onClick={() => setShowTimerFinished(false)}
                className="mt-4 px-6 py-2 bg-white text-red-700 font-bold rounded-full hover:bg-red-100 pointer-events-auto"
              >
                閉じる
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Custom Modals */}
      {confirmDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-xl shadow-xl max-w-sm w-full mx-4">
            <p className="text-lg font-bold mb-6">{confirmDialog.message}</p>
            <div className="flex justify-end gap-4">
              <button
                onClick={() => setConfirmDialog(null)}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={() => {
                  confirmDialog.onConfirm();
                  setConfirmDialog(null);
                }}
                className="px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
      {alertDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-xl shadow-xl max-w-sm w-full mx-4">
            <p className="text-lg font-bold mb-6">{alertDialog}</p>
            <div className="flex justify-end">
              <button
                onClick={() => setAlertDialog(null)}
                className="px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="w-full bg-[#2A4C3A] py-2 px-4 flex justify-between items-center border-b-2 border-black/20 shrink-0 shadow-sm">
        <div className="flex-1"></div>
        <span className="text-white font-black tracking-wide shrink-0 flex justify-center items-center">
          {timerRemaining !== null ? (
            <span className={`font-mono font-black text-3xl sm:text-4xl leading-none tracking-tighter ${timerRemaining <= 60 ? 'text-red-400' : 'text-amber-300'}`}>
              {Math.floor(timerRemaining / 60)}:{String(timerRemaining % 60).padStart(2, '0')}
            </span>
          ) : (
            <span className="text-base sm:text-lg">{appTitle}</span>
          )}
        </span>
        <div className="flex-1 flex justify-end items-center gap-2">
          {!isTimerRunning ? (
            <button
              onClick={startTimer}
              className="bg-amber-600 hover:bg-amber-700 text-white text-xs sm:text-sm font-bold px-2 py-1 rounded shadow-sm whitespace-nowrap"
            >
              5分タイマー
            </button>
          ) : (
            <button
              onClick={stopTimer}
              className="bg-red-600 hover:bg-red-700 text-white text-xs sm:text-sm font-bold px-2 py-1 rounded shadow-sm whitespace-nowrap"
            >
              停止
            </button>
          )}
        </div>
      </div>
      <header className="w-full flex-none px-2 sm:px-4 py-2 flex items-center justify-between shadow-sm z-10 bg-[#1A2F24] text-white border-b border-black/20">
        <button
          onClick={() => setCurrentProblemIndex(prev => Math.max(0, prev - 10))}
          disabled={currentProblemIndex === 0}
          className="p-1 sm:p-2 rounded-full hover:bg-white/20 disabled:opacity-30 transition-colors"
          title="10問戻る"
        >
          <ChevronsLeft className="w-5 h-5 sm:w-6 sm:h-6" />
        </button>

        <div className="flex items-center gap-1 sm:gap-2">
          <button
            onClick={() => setCurrentProblemIndex(prev => Math.max(0, prev - 1))}
            disabled={currentProblemIndex === 0}
            className="p-1 sm:p-2 rounded-full hover:bg-white/20 disabled:opacity-30 transition-colors"
            title="前の問題"
          >
            <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
          
          <div className="flex justify-center items-center gap-2 sm:gap-4 mx-1 sm:mx-2">
            <h2 className="text-base sm:text-lg md:text-xl font-bold text-white whitespace-nowrap">
              {solvedProblems.includes(currentProblem?.id) ? '🔴 ' : ''}{currentProblem?.title}
            </h2>
            <span className="font-bold px-3 py-1 bg-[#2A4C3A] rounded-full text-xs sm:text-sm whitespace-nowrap text-white">
              問題 {currentProblemIndex + 1} / {problems.length}
            </span>
          </div>

          <button
            onClick={goToNextProblem}
            disabled={!isRandomOrder && currentProblemIndex === problems.length - 1 && solvedProblems.length === problems.length && !(isTimerRunning && failedProblemIds.length > 0)}
            className="p-1 sm:p-2 rounded-full hover:bg-white/20 disabled:opacity-30 transition-colors"
            title="次の問題"
          >
            <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>

        <button
          onClick={() => setCurrentProblemIndex(prev => Math.min(problems.length - 1, prev + 10))}
          disabled={currentProblemIndex === problems.length - 1}
          className="p-1 sm:p-2 rounded-full hover:bg-white/20 disabled:opacity-30 transition-colors"
          title="10問進む"
        >
          <ChevronsRight className="w-5 h-5 sm:w-6 sm:h-6" />
        </button>
      </header>

      <main className={`flex-1 w-full min-h-0 flex flex-col items-center p-2 relative ${isEditMode ? 'overflow-y-auto pb-32' : 'overflow-hidden'}`}>
        <div className={`w-full max-w-lg flex flex-col gap-1 sm:gap-2 items-center justify-start pt-1 sm:pt-2 ${isEditMode ? 'overflow-visible h-auto min-h-full' : 'overflow-hidden h-full'}`}>
            <div className="w-full max-w-full sm:max-w-[480px] flex flex-row px-0 sm:px-2">
              <div className="w-full bg-[#D1A15B] p-1 sm:p-3 rounded-lg sm:rounded-xl border border-[#D1A15B] min-h-[40px] flex flex-row items-center gap-2 sm:gap-4 shadow-sm">
                <h3 className="text-xs sm:text-sm font-bold text-black whitespace-nowrap ml-1 sm:ml-0">後手</h3>
                <div className="flex-1 flex flex-row justify-start flex-wrap">
                  {renderHand(Color.White)}
                </div>
              </div>
            </div>

            <div className="flex flex-col items-center w-full">
              <div className={`relative w-full max-w-[min(100vw-16px,50vh)] p-0 sm:p-2 sm:rounded-lg shadow-sm sm:shadow-2xl flex-shrink-0 transition-colors ${isEditMode ? 'bg-[#D1A15B] border-4 border-amber-500' : 'bg-[#D1A15B] border-2 sm:border-4 border-[#D1A15B]'}`}>
                {isEditMode && (
                  <div className="absolute top-0 left-0 right-0 bg-stone-500 text-white text-[10px] sm:text-xs font-bold text-center py-0.5 sm:py-1 sm:rounded-t-sm z-10">
                    盤面編集モード
                  </div>
                )}
                <div className={`grid grid-cols-9 w-full bg-[#EFC07E] border-[4px] border-[#D1A15B] shadow-inner align-top ${isEditMode ? 'mt-4 sm:mt-4' : ''}`}>
                  {renderBoard()}
                </div>
                <AnimatePresence>
                  {showCorrectSplash && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 1.1 }}
                      transition={{ duration: 0.3, ease: "easeOut" }}
                      className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none"
                    >
                      <div className="bg-[#e4eed9]/95 border-[3px] border-[#a0c58e] rounded-full px-6 py-3 sm:px-10 sm:py-4 shadow-xl flex items-center gap-3 backdrop-blur-sm">
                        <Check className="w-8 h-8 sm:w-14 sm:h-14 text-[#66984e]" strokeWidth={2.5} />
                        <span className="text-3xl sm:text-5xl font-black text-[#66984e] tracking-widest">正解！</span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <div className="w-full max-w-full sm:max-w-[480px] flex flex-row px-0 sm:px-2">
              <div className="w-full bg-[#D1A15B] p-1.5 sm:p-2.5 rounded-lg sm:rounded-xl border border-[#D1A15B] min-h-[46px] flex flex-row items-center gap-2 shadow-sm relative">
                {message === 'CORRECT' ? (
                  solvedProblems.length < problems.length ? (
                    <div className="flex-1 flex justify-center items-center">
                      <button
                        onClick={goToNextProblem}
                        className="bg-[#31A24C] hover:bg-[#28883f] text-white py-1.5 px-4 sm:px-6 rounded-lg font-bold text-base sm:text-lg transition-colors shadow-sm active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <span>🎉次の問題へ</span>
                        <ChevronRight size={20} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex-1 flex justify-center items-center">
                      <div className="bg-[#31A24C] text-white py-1.5 px-4 sm:px-6 rounded-lg font-bold text-base sm:text-lg text-center shadow-sm flex items-center justify-center gap-2">
                        <span>🎉全問クリア！おめでとうございます！</span>
                      </div>
                    </div>
                  )
                ) : (
                  <>
                    <h3 className="text-xs sm:text-sm font-bold text-black whitespace-nowrap ml-1 sm:ml-0">先手</h3>
                    <div className="flex-1 flex flex-row justify-center flex-wrap">
                      {renderHand(Color.Black)}
                    </div>
                  </>
                )}
                <button
                  onClick={() => setShowProgressModal(true)}
                  className="w-8 h-8 sm:w-10 sm:h-10 bg-white text-stone-800 border-2 border-stone-800 rounded-full shadow flex items-center justify-center hover:bg-stone-100 hover:scale-105 active:scale-95 transition-all flex-shrink-0"
                  title="正解状況を見る"
                >
                  <ListOrdered size={18} className="sm:scale-110 text-stone-900" />
                </button>
              </div>
            </div>
            
            <div className={`
              w-full max-w-full sm:max-w-[480px] p-2 sm:p-3 rounded-lg sm:rounded-xl text-center font-bold text-sm sm:text-lg transition-all duration-300 mx-2 sm:mx-0 shadow-sm
              ${isGameOver ? 'bg-green-100 text-green-800 scale-105' : 'bg-[#FFF9E6] border border-[#E8DCC0] text-[#5A4A32]'}
            `}>
              {message === 'CORRECT' ? (
                solvedProblems.length >= problems.length ? (
                  <div className="flex flex-col items-center gap-2 py-1">
                    <span className="text-green-800 text-sm sm:text-base font-bold">全問クリア！おめでとうございます🎉</span>
                    {clearUrl && (
                      <a
                        href={clearUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white py-2 px-6 rounded-lg font-bold text-sm sm:text-base transition-all shadow-md mt-1 cursor-pointer no-underline"
                      >
                        <ExternalLink size={18} />
                        クリア登録
                      </a>
                    )}
                  </div>
                ) : (
                  <span className="text-green-800 font-bold">正解！おめでとうございます！</span>
                )
              ) : (
                message
              )}
            </div>

            <div className="grid grid-cols-4 w-full max-w-full px-1 sm:px-0 sm:max-w-[480px] gap-1 sm:gap-2 mt-1 sm:mt-0">
              <button
                onClick={() => {
                  if (isTimerRunning) {
                    setResetCounts(prev => ({
                      ...prev,
                      [currentProblem.id]: (prev[currentProblem.id] || 0) + 1
                    }));
                    setFailedProblemIds(prev => {
                      if (!prev.includes(currentProblem.id)) {
                        return [...prev, currentProblem.id];
                      }
                      return prev;
                    });
                    goToNextProblem();
                  } else {
                    if (moveHistory.length > 0 && message !== 'CORRECT') {
                      setResetCounts(prev => ({
                        ...prev,
                        [currentProblem.id]: (prev[currentProblem.id] || 0) + 1
                      }));
                    }
                    resetGame();
                  }
                }}
                className={`flex items-center justify-center gap-0.5 sm:gap-1 ${isTimerRunning ? 'bg-red-700 hover:bg-red-800' : 'bg-amber-800 hover:bg-amber-900'} text-white py-1.5 sm:py-2.5 rounded-lg sm:rounded-xl font-bold text-xs sm:text-sm transition-colors shadow-sm active:scale-95 px-1`}
              >
                {isTimerRunning ? (
                  <>
                    <ChevronRight size={14} className="shrink-0" />
                    <span className="truncate">不詰み次へ</span>
                  </>
                ) : (
                  <>
                    <RotateCcw size={14} className="shrink-0" />
                    <span className="truncate">最初から</span>
                  </>
                )}
              </button>
              <button
                onClick={handleChangeGoteMove}
                disabled={moveHistory.length === 0 || moveHistory.length % 2 !== 0}
                className={`flex items-center justify-center bg-gray-600 text-white py-1.5 sm:py-2.5 rounded-lg sm:rounded-xl font-bold text-xs sm:text-sm transition-colors shadow-sm active:scale-95 px-1 ${moveHistory.length === 0 || moveHistory.length % 2 !== 0 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-700'}`}
              >
                <span className="truncate">後手変更</span>
              </button>
              <button
                onClick={() => setShowAnswerModal(true)}
                className={`flex items-center justify-center gap-0.5 sm:gap-1 ${currentProblem?.answerImageUrl ? 'bg-emerald-700 hover:bg-emerald-800' : 'bg-stone-700 hover:bg-stone-800'} text-white py-1.5 sm:py-2.5 rounded-lg sm:rounded-xl font-bold text-xs sm:text-sm transition-colors shadow-sm active:scale-95 relative px-1`}
              >
                <Eye size={14} className="shrink-0" />
                <span className="truncate">解説</span>
                {currentProblem?.answerImageUrl && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-400 border border-white rounded-full"></span>
                )}
              </button>
              <button
                onClick={handleRegisterSolutionClick}
                className={`flex items-center justify-center gap-0.5 sm:gap-1 ${
                  currentProblem?.solution && currentProblem.solution.length > 0
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-blue-600 hover:bg-blue-700'
                } text-white py-1.5 sm:py-2.5 rounded-lg sm:rounded-xl font-bold text-xs sm:text-sm transition-colors shadow-sm active:scale-95 relative px-1`}
              >
                {currentProblem?.solution && currentProblem.solution.length > 0 ? (
                  <>
                    <Check size={14} className="shrink-0" />
                    <span className="truncate">解答</span>
                  </>
                ) : (
                  <>
                    <Plus size={14} className="shrink-0" />
                    <span className="truncate">解答登録</span>
                  </>
                )}
              </button>
            </div>

            <div className="w-full max-w-full sm:max-w-[480px] flex flex-row items-center gap-2 px-0 sm:px-2 mt-1 z-10 shrink-0">
              <p className="flex-1 text-sm sm:text-base text-stone-900 truncate font-bold bg-white/60 p-2 sm:p-2.5 rounded-xl border border-stone-800/10 shadow-sm text-center" title={currentProblem?.description || "解説はありません"}>
                {currentProblem?.description || "解説はありません"}
              </p>
              <button
                onClick={() => setIsToolbarOpen(true)}
                className="w-8 h-8 sm:w-10 sm:h-10 bg-amber-600 text-white border-2 border-stone-800 rounded-full shadow flex items-center justify-center hover:bg-amber-700 hover:scale-105 active:scale-95 transition-all flex-shrink-0"
                title="ツール・設定を開く"
              >
                <Menu size={18} className="sm:scale-110" />
              </button>
            </div>

          {isEditMode && (
            <div className="w-full max-w-[600px] px-2 sm:px-0 flex flex-col gap-4">
              <div className="bg-white/80 p-4 rounded-xl border border-stone-400 shadow-sm space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <Edit2 size={20} className="text-stone-700" />
                  <h3 className="font-bold text-stone-800">問題の設定と盤面編集</h3>
                </div>

                <div className="space-y-4 border-b border-stone-300 pb-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-stone-700 block uppercase tracking-wider">問題タイトル</label>
                    <input
                      type="text"
                      value={currentProblem.title}
                      onChange={(e) => {
                        const updatedProblems = [...problems];
                        updatedProblems[currentProblemIndex] = {
                          ...currentProblem,
                          title: e.target.value,
                        };
                        setProblems(updatedProblems);
                      }}
                      className="w-full text-xl font-bold p-2 border border-stone-400 rounded-lg bg-white text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-500"
                      placeholder="問題のタイトルを入力"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-stone-700 block uppercase tracking-wider">解説・ヒント</label>
                    <textarea
                      value={currentProblem.description || ''}
                      onChange={(e) => {
                        const updatedProblems = [...problems];
                        updatedProblems[currentProblemIndex] = {
                          ...currentProblem,
                          description: e.target.value,
                        };
                        setProblems(updatedProblems);
                      }}
                      className="w-full p-3 border border-stone-400 rounded-xl bg-white text-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-500"
                      rows={3}
                      placeholder="問題の説明を入力してください"
                    />
                  </div>
                  <div className="space-y-2 pt-2 border-t border-stone-200">
                    <label className="text-xs font-bold text-stone-700 block uppercase tracking-wider">解答画像（スクリーンショット）</label>
                    {currentProblem.answerImageUrl ? (
                      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-3 bg-white border border-stone-300 rounded-xl">
                        <img
                          src={currentProblem.answerImageUrl}
                          alt="解答プレビュー"
                          className="w-24 h-24 object-contain rounded-lg border border-stone-200 bg-stone-50"
                        />
                        <div className="flex flex-col gap-2">
                          <span className="text-xs text-stone-600 font-bold">解答画像が登録されています</span>
                          <div className="flex gap-2">
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              ref={editAnswerFileInputRef}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleAnswerImageUpload(file);
                                if (e.target) e.target.value = '';
                              }}
                            />
                            <button
                              onClick={() => editAnswerFileInputRef.current?.click()}
                              className="px-3 py-1.5 bg-stone-200 hover:bg-stone-300 text-stone-800 rounded-lg text-xs font-bold transition-colors flex items-center gap-1"
                            >
                              <Upload size={14} /> 変更
                            </button>
                            <button
                              onClick={handleDeleteAnswerImage}
                              className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-xs font-bold transition-colors flex items-center gap-1"
                            >
                              <Trash2 size={14} /> 削除
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 bg-white border border-stone-300 rounded-xl flex items-center justify-between">
                        <span className="text-xs text-stone-500">解答画像は未登録です</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          ref={editAnswerFileInputRef}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleAnswerImageUpload(file);
                            if (e.target) e.target.value = '';
                          }}
                        />
                        <button
                          onClick={() => editAnswerFileInputRef.current?.click()}
                          className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1"
                        >
                          <Upload size={14} /> 解答画像を登録
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mb-4">
                  <button
                    onClick={() => setEditTool('eraser')}
                    className={`px-3 py-1 rounded border text-sm ${editTool === 'eraser' ? 'bg-amber-400 border-amber-600 font-bold' : 'bg-white hover:bg-stone-200'}`}
                  >
                    消しゴム
                  </button>
                  <button
                    onClick={() => {
                      setEditTool(null);
                      setSelectedSquare(null);
                    }}
                    className={`px-3 py-1 rounded border text-sm ${editTool === null ? 'bg-amber-400 border-amber-600 font-bold' : 'bg-white hover:bg-stone-200'}`}
                  >
                    移動 / 反転
                  </button>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1">
                    <div className="text-xs font-bold mb-1 text-stone-800">先手（黒）の駒を配置</div>
                    <div className="flex flex-wrap gap-1">
                      {['FU', 'KY', 'KE', 'GI', 'KI', 'KA', 'HI', 'OU', 'TO', 'NY', 'NK', 'NG', 'UM', 'RY'].map(kind => (
                        <button
                          key={`black-${kind}`}
                          onClick={() => setEditTool({ kind, color: Color.Black })}
                          className={`w-8 h-8 flex items-center justify-center border rounded text-sm ${editTool !== 'eraser' && editTool?.kind === kind && editTool?.color === Color.Black ? 'bg-amber-400 border-amber-600 font-bold' : 'bg-white hover:bg-stone-200'}`}
                        >
                          {PIECE_NAMES[kind]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="text-xs font-bold mb-1 text-stone-800">後手（白）の駒を配置</div>
                    <div className="flex flex-wrap gap-1">
                      {['FU', 'KY', 'KE', 'GI', 'KI', 'KA', 'HI', 'OU', 'TO', 'NY', 'NK', 'NG', 'UM', 'RY'].map(kind => (
                        <button
                          key={`white-${kind}`}
                          onClick={() => setEditTool({ kind, color: Color.White })}
                          className={`w-8 h-8 flex items-center justify-center border rounded text-sm ${editTool !== 'eraser' && editTool?.kind === kind && editTool?.color === Color.White ? 'bg-amber-400 border-amber-600 font-bold' : 'bg-white hover:bg-stone-200'}`}
                        >
                          <span className="rotate-180">{PIECE_NAMES[kind]}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex justify-end">
                  <button 
                    onClick={toggleEditMode}
                    className="w-full sm:w-auto bg-amber-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-amber-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <Check size={18} />
                    編集を完了してセーブする
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Progress Modal */}
      <AnimatePresence>
        {showProgressModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
            onClick={() => setShowProgressModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="bg-stone-100 w-full max-w-md rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="p-4 border-b border-stone-800/10 flex justify-between items-center bg-white/50 relative">
                <h3 className="font-bold text-stone-800 text-lg">正解状況</h3>
                <button
                  onClick={() => {
                    setSolvedProblems([]);
                    setSolvedAiMovesMap({});
                    setResetCounts({});
                    setFailedProblemIds([]);
                    stopTimer();
                    setShowProgressModal(false);
                    setShowStartupModal(true);
                  }}
                  className="absolute left-1/2 -translate-x-1/2 px-3 py-1 bg-red-600 text-white rounded-lg font-bold text-sm hover:bg-red-700 active:scale-95 transition-all shadow-sm flex items-center gap-1"
                >
                  <RotateCcw size={14} />
                  リセット
                </button>
                <button onClick={() => setShowProgressModal(false)} className="p-2 bg-stone-200 rounded-full text-stone-800 hover:bg-stone-300 transition-colors">
                  <X size={20} />
                </button>
              </div>
              <div className="p-4 overflow-y-auto flex-1 bg-white/30">
                 <div className="grid grid-cols-5 gap-2 sm:gap-3">
                   {problems.map((p, i) => {
                      const isSolved = solvedProblems.includes(p.id);
                      const isCurrent = currentProblemIndex === i;
                      const resetCount = resetCounts[p.id] || 0;
                      return (
                        <button 
                          key={p.id} 
                          onClick={() => { setCurrentProblemIndex(i); setShowProgressModal(false); }} 
                          className={`
                            relative p-2 rounded-xl flex flex-col items-center justify-center border-2 transition-all shadow-sm
                            ${isCurrent ? 'ring-2 ring-stone-500 ring-offset-2 ring-offset-[#fdf6e3]' : ''}
                            ${isSolved ? 'bg-green-100 border-green-300 text-green-800 hover:bg-green-200' : resetCount > 0 ? 'bg-red-50 border-red-200 text-red-500 hover:bg-red-100' : 'bg-white border-stone-300 text-stone-800 hover:bg-stone-50'}
                          `}
                        >
                           <span className="text-sm font-bold">{i+1}</span>
                           <div className={`text-xs mt-1 font-semibold ${isSolved ? 'text-green-700/80' : resetCount > 0 ? 'text-red-400' : 'text-stone-700/80'}`}>
                             {resetCount}回
                           </div>
                        </button>
                      );
                   })}
                 </div>
              </div>
              <div className="p-4 bg-stone-50/50 border-t border-stone-800/10 flex flex-col items-center gap-3">
                <div className="flex items-center justify-center gap-8 w-full">
                  <span className="text-sm font-bold text-stone-800">
                    正解：{solvedProblems.length}問 / {problems.length}
                  </span>
                  <span className="text-sm font-bold text-stone-800">
                    間違えた回数: {Object.values(resetCounts).reduce((a, b) => (a as number) + (b as number), 0)}回
                  </span>
                </div>
                {solvedProblems.length > 0 && solvedProblems.length === problems.length && clearUrl && (
                  <a
                    href={clearUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white py-2 px-4 rounded-xl font-bold text-sm shadow-md transition-all no-underline"
                  >
                    <ExternalLink size={16} />
                    全問クリア！クリア登録はこちら
                  </a>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action Drawer */}
      <AnimatePresence>
        {isToolbarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-40"
            onClick={() => setIsToolbarOpen(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: "spring", bounce: 0, duration: 0.4 }}
              className="absolute bottom-0 left-0 right-0 max-h-[85vh] bg-stone-100 rounded-t-3xl shadow-2xl overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="sticky top-0 bg-stone-100/90 backdrop-blur pb-2 pt-4 px-6 border-b border-stone-800/10 flex justify-between items-center relative z-10">
                <h2 className="font-bold text-stone-800 text-lg">ツール・設定</h2>
                <div className="absolute left-1/2 -translate-x-1/2 flex items-center">
                  <a
                    href="https://sites.google.com/view/mkshogi-practice/%E3%83%9B%E3%83%BC%E3%83%A0"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-sm rounded-lg transition-all shadow-sm no-underline"
                  >
                    <ExternalLink size={16} />
                    サイトへ
                  </a>
                </div>
                <button
                  onClick={() => setIsToolbarOpen(false)}
                  className="p-2 bg-stone-200 rounded-full text-stone-800 hover:bg-stone-300"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-4 sm:p-6 space-y-6">
                <section className="bg-white/60 p-4 rounded-xl border border-stone-300 shadow-sm flex flex-col gap-2">
                  <label className="text-xs font-bold text-stone-700 uppercase tracking-wider block">アプリのタイトル</label>
                  <input
                    type="text"
                    value={appTitle}
                    onChange={(e) => {
                      setAppTitle(e.target.value);
                      localStorage.setItem('tsumeShogiAppTitle', e.target.value);
                    }}
                    onBlur={() => {
                      saveProblemsData(problems, appTitle, clearUrl);
                    }}
                    className="w-full text-lg font-bold p-2 border border-stone-400 rounded-lg bg-white text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-500"
                    placeholder="アプリのタイトル"
                  />
                </section>

                <section className="bg-white/60 p-4 rounded-xl border border-stone-300 shadow-sm flex flex-col gap-2">
                  <label className="text-xs font-bold text-stone-700 uppercase tracking-wider block">クリア登録URL（全問クリア時のリンク先）</label>
                  <input
                    type="text"
                    value={clearUrl}
                    onChange={(e) => {
                      setClearUrl(e.target.value);
                      localStorage.setItem('tsumeShogiClearUrl', e.target.value);
                    }}
                    onBlur={() => {
                      saveProblemsData(problems, appTitle, clearUrl);
                    }}
                    className="w-full text-sm font-mono p-2 border border-stone-400 rounded-lg bg-white text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-500"
                    placeholder="https://.../complete?book=01"
                  />
                  <span className="text-[11px] text-stone-600">全問正解時に表示される「クリア登録」ボタンの遷移先URLです。問題データや保存データセットに一緒にJSON保存されます。</span>
                </section>

                <section className="bg-white/60 p-4 sm:p-6 rounded-xl border border-stone-300 shadow-sm flex flex-col gap-4">
                  {isEditMode ? (
                    <div className="flex items-center justify-center p-4">
                       <p className="text-stone-800 font-bold mb-2">盤面と情報を編集中...</p>
                    </div>
                  ) : (
                    <>
                      <p className="text-stone-800 leading-relaxed whitespace-pre-wrap border-b border-stone-800/10 pb-4">
                        {currentProblem?.description}
                      </p>
                      <div className="flex justify-end">
                        <button 
                          onClick={toggleEditMode}
                          className="flex items-center gap-1 text-sm px-4 py-2 rounded transition-colors bg-stone-300 text-stone-800 hover:bg-amber-300 font-bold shadow-sm"
                          title="問題の設定と盤面を編集する"
                        >
                          <Edit2 size={16} /> 盤面・設定の編集
                        </button>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap pt-2">
                        <button onClick={() => setShowInfo(!showInfo)} className="text-stone-600 hover:text-stone-800 flex items-center gap-1 text-sm font-bold bg-stone-200 px-2 py-1 rounded" title="ヒント">
                          <Info size={16} /> ヒント
                        </button>
                        <button onClick={moveProblemUp} disabled={currentProblemIndex === 0} className="p-1 text-stone-600 hover:bg-stone-300 rounded disabled:opacity-30" title="前に移動"><ArrowUp size={16} /></button>
                        <button onClick={moveProblemDown} disabled={currentProblemIndex === problems.length - 1} className="p-1 text-stone-600 hover:bg-stone-300 rounded disabled:opacity-30" title="後ろに移動"><ArrowDown size={16} /></button>
                        <button onClick={renumberProblems} className="p-1 text-stone-600 hover:bg-stone-300 rounded" title="問題番号を順番通りに振り直す"><ListOrdered size={16} /></button>
                        <button onClick={duplicateProblem} className="p-1 text-stone-600 hover:bg-stone-300 rounded" title="この問題を複製"><Copy size={16} /></button>
                        <button onClick={deleteProblem} className="p-1 text-red-500 hover:bg-red-100 rounded" title="この問題を削除"><Trash2 size={16} /></button>
                      </div>
                    </>
                  )}
                </section>

                <AnimatePresence>
                  {showInfo && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-sm text-blue-800"
                    >
                      <p><strong>ヒント:</strong> 相手の玉を逃げ場のない状態（詰み）にしてください。王手以外の手（必至など）を指すことも可能です。</p>
                    </motion.div>
                  )}
                </AnimatePresence>

                <section className="bg-white/60 p-4 rounded-xl border border-stone-300 shadow-sm flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="font-bold text-stone-800 text-sm">出題順ランダム</span>
                      <span className="text-xs text-stone-700">ONにすると未正解の問題からランダムに出題します</span>
                    </div>
                    <button
                      onClick={() => {
                        const next = !isRandomOrder;
                        setIsRandomOrder(next);
                        localStorage.setItem('tsumeShogiRandomOrder', String(next));
                      }}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-stone-500 focus:ring-offset-2 ${isRandomOrder ? 'bg-amber-600' : 'bg-gray-300'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isRandomOrder ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                </section>

                <div className="w-full">
                  <div className="bg-white/60 p-4 rounded-xl border border-stone-300 shadow-sm flex flex-col gap-4">
                    <div className="flex items-center gap-2 text-stone-800">
                      <Settings size={20} />
                      <span className="font-bold text-sm">アプリ内データ管理</span>
                    </div>

                    <button
                      onClick={saveCurrentDataSet}
                      className="w-full flex items-center justify-center gap-2 bg-amber-800 text-white px-4 py-2 rounded-lg font-bold hover:bg-amber-900 transition-colors"
                      title="現在のすべての問題リストをアプリ内に新しく保存します"
                    >
                      <Plus size={18} />
                      現在のデータをアプリに保存
                    </button>

                    <div className="flex gap-2 w-full mt-2">
                      <button
                        onClick={copyAllDataSets}
                        className="flex items-center justify-center gap-2 text-xs text-stone-700 hover:text-stone-800 bg-white px-2 py-1.5 rounded-md border border-stone-400 shadow-sm transition-colors flex-1"
                        title="保存済みデータセットをクリップボードにコピー"
                      >
                        <ClipboardCopy size={14} />
                        保存データをコピー
                      </button>
                      <input
                        type="file"
                        accept="application/json"
                        className="hidden"
                        ref={datasetsJsonFileInputRef}
                        onChange={handleDataSetsJsonImport}
                      />
                      <button
                        onClick={() => datasetsJsonFileInputRef.current?.click()}
                        className="flex items-center justify-center gap-2 text-xs text-stone-700 hover:text-stone-800 bg-white px-2 py-1.5 rounded-md border border-stone-400 shadow-sm transition-colors flex-1"
                        title="保存済みデータセットをインポート"
                      >
                        <Download size={14} />
                        保存データをインポート
                      </button>
                    </div>

                    {savedDataSets.length > 0 && (
                      <div className="flex flex-col gap-2 mt-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-stone-700">保存済みデータ（クリックで読み込み）:</span>
                          <span className="text-[11px] text-stone-500">矢印で並び順を変更</span>
                        </div>
                        <div className="max-h-48 overflow-y-auto pr-1 flex flex-col gap-2">
                          {savedDataSets.map((ds, index) => {
                            const match = ds.title.match(/^(.*?)\s*(\(\d{4}[/-]\d{1,2}[/-]\d{1,2}\))$/);
                            const mainTitle = match ? match[1] : ds.title;
                            const dateStr = match ? match[2] : null;

                            return (
                              <div key={ds.id} className="flex items-center justify-between bg-white px-3 py-2 rounded-md border border-stone-300 shadow-sm text-sm hover:border-amber-400 cursor-pointer transition-colors" onClick={() => loadDataSet(ds)}>
                                <div className="flex flex-col overflow-hidden flex-1 min-w-0 pr-2">
                                  <span className="font-bold text-stone-800 truncate">{mainTitle}</span>
                                  <div className="flex items-center gap-2 text-xs text-stone-600 truncate">
                                    {dateStr && <span>{dateStr}</span>}
                                    <span>{ds.problems.length}問</span>
                                  </div>
                                </div>
                              <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={() => moveDataSetUp(index)}
                                  disabled={index === 0}
                                  className="p-1.5 text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded disabled:opacity-20 disabled:hover:bg-transparent transition-colors"
                                  title="上へ移動"
                                >
                                  <ArrowUp size={16} />
                                </button>
                                <button
                                  onClick={() => moveDataSetDown(index)}
                                  disabled={index === savedDataSets.length - 1}
                                  className="p-1.5 text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded disabled:opacity-20 disabled:hover:bg-transparent transition-colors"
                                  title="下へ移動"
                                >
                                  <ArrowDown size={16} />
                                </button>
                                <button
                                  onClick={() => deleteDataSet(ds.id)}
                                  className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                  title="削除"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="w-full mt-4">
                  <div className="bg-white/60 p-4 rounded-xl border border-stone-300 shadow-sm flex flex-col items-center justify-between gap-4">
                    <div className="flex flex-col items-start gap-4 text-stone-800 w-full">
                      <div className="flex items-center gap-2">
                        <Upload size={20} />
                        <span className="font-bold text-sm">問題を追加・エクスポートする</span>
                      </div>
                      
                      <div className="flex flex-wrap gap-2 w-full">
                        <button
                          onClick={copyAllData}
                          className="flex items-center justify-center gap-2 text-sm text-stone-700 hover:text-stone-800 bg-white px-3 py-1.5 rounded-md border border-stone-400 shadow-sm transition-colors flex-1"
                          title="現在の問題データをクリップボードにコピー"
                        >
                          <ClipboardCopy size={16} />
                          データをコピー
                        </button>

                        <input
                          type="file"
                          accept="application/json"
                          className="hidden"
                          ref={jsonFileInputRef}
                          onChange={handleJsonImport}
                        />
                        <button
                          onClick={() => jsonFileInputRef.current?.click()}
                          className="flex items-center justify-center gap-2 text-sm text-stone-700 hover:text-stone-800 bg-white px-3 py-1.5 rounded-md border border-stone-400 shadow-sm transition-colors flex-1"
                          title="JSONファイルから問題データをインポート"
                        >
                          <Download size={16} />
                          インポート
                        </button>

                        <button
                          onClick={() => {
                            if (problems.length <= 1) {
                              setAlertDialog('削除できる問題がありません。');
                              return;
                            }
                            setConfirmDialog({
                              message: '第1問以外のすべての問題を削除しますか？\n(この操作は取り消せません)',
                              onConfirm: () => {
                                const newProblems = [problems[0]];
                                setProblems(newProblems);
                                setCurrentProblemIndex(0);
                                localStorage.setItem('tsumeShogiProblems', JSON.stringify(newProblems));
                                setAlertDialog('第1問以外の問題をすべて削除しました。');
                              }
                            });
                          }}
                          className="flex items-center justify-center gap-2 text-sm text-red-700 hover:text-red-900 bg-red-50 px-3 py-1.5 rounded-md border border-red-200 shadow-sm transition-colors w-full mt-2"
                          title="第1問以外のすべての問題を削除する"
                        >
                          <RotateCcw size={16} />
                          初期化
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-col gap-4 w-full mt-2 pt-4 border-t border-stone-800/10">
                      <button
                        onClick={handleAddEmptyProblem}
                        className="w-full flex items-center justify-center gap-2 bg-stone-200 text-stone-800 px-4 py-2 rounded-lg font-bold hover:bg-stone-300 transition-colors"
                      >
                        <Plus size={18} />
                        空の盤面を追加
                      </button>
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        className="hidden"
                        ref={fileInputRef}
                        onChange={handleImageUpload}
                      />
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                        className="w-full flex items-center justify-center gap-2 bg-stone-200 text-stone-800 px-4 py-2 rounded-lg font-bold hover:bg-stone-300 transition-colors disabled:opacity-50"
                      >
                        {isUploading ? (
                          <Loader2 size={18} className="animate-spin" />
                        ) : (
                          <Upload size={18} />
                        )}
                        {isUploading ? '解析中...' : '画像/PDFから追加'}
                      </button>
                    </div>
                  </div>
                  {uploadError && (
                    <div className="mt-2 text-red-600 text-sm bg-red-50 p-3 rounded-lg border border-red-100 flex items-start gap-2">
                      <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                      <span>{uploadError}</span>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Promotion Dialog */}
      <AnimatePresence>
        {pendingPromotionMove && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="bg-white p-8 rounded-2xl shadow-2xl flex flex-col items-center gap-6 max-w-sm w-full"
            >
              <h3 className="text-2xl font-bold text-stone-800">成りますか？</h3>
              <div className="flex gap-4 w-full">
                <button
                  onClick={() => {
                    const move = { ...pendingPromotionMove, promote: true };
                    processMove(move);
                    setSelectedSquare(null);
                  }}
                  className="flex-1 py-4 bg-amber-600 text-white font-bold rounded-xl hover:bg-amber-700 transition-colors text-lg shadow-md"
                >
                  成る
                </button>
                <button
                  onClick={() => {
                    const move = { ...pendingPromotionMove, promote: false };
                    processMove(move);
                    setSelectedSquare(null);
                  }}
                  className="flex-1 py-4 bg-gray-200 text-gray-800 font-bold rounded-xl hover:bg-gray-300 transition-colors text-lg shadow-md"
                >
                  成らず
                </button>
              </div>
              <button
                onClick={() => {
                  setPendingPromotionMove(null);
                  setSelectedSquare(null);
                }}
                className="text-sm text-gray-500 hover:text-gray-700 underline mt-2"
              >
                キャンセル
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Startup Dataset Selection Modal */}
      <AnimatePresence>
        {showStartupModal && !isLoadingProblems && savedDataSets.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-[#FDF6E2] w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-[#EBE4D3] flex flex-col max-h-[80vh]"
            >
              <div className="p-4 sm:p-6 pb-2 border-b border-stone-800/10">
                <h2 className="text-xl font-bold text-stone-800 text-center">どの問題を解きますか？</h2>
              </div>
              <div className="px-4 py-3 sm:px-6 bg-[#FDF6E2] border-b border-stone-800/10 flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="font-bold text-stone-800 text-sm">出題順ランダム</span>
                  <span className="text-xs text-stone-700 mt-0.5">ONにすると最初の問題もランダムに選びます</span>
                </div>
                <button
                  onClick={() => {
                    const next = !isRandomOrder;
                    setIsRandomOrder(next);
                    localStorage.setItem('tsumeShogiRandomOrder', String(next));
                  }}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-stone-500 focus:ring-offset-2 flex-shrink-0 ${isRandomOrder ? 'bg-amber-600' : 'bg-gray-300'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isRandomOrder ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
              <div className="p-4 sm:p-6 overflow-y-auto flex-1 flex flex-col gap-3">
                <span className="text-sm font-bold text-stone-700">保存済みデータから選ぶ:</span>
                <div className="flex flex-col gap-2">
                  {savedDataSets.map((ds) => {
                    const match = ds.title.match(/^(.*?)\s*(\(\d{4}[/-]\d{1,2}[/-]\d{1,2}\))$/);
                    const mainTitle = match ? match[1] : ds.title;
                    const dateStr = match ? match[2] : null;

                    return (
                      <button
                        key={ds.id}
                        onClick={() => {
                          loadDataSetFromStartup(ds);
                        }}
                        className="flex flex-col items-start bg-white px-4 py-3 rounded-lg border border-stone-300 shadow-sm hover:border-amber-400 hover:bg-stone-50 transition-colors w-full text-left focus:outline-none focus:ring-2 focus:ring-stone-500"
                      >
                        <span className="font-bold text-stone-800 text-base leading-snug">{mainTitle}</span>
                        <div className="flex items-center gap-2.5 text-xs text-stone-600 mt-1">
                          {dateStr && <span>{dateStr}</span>}
                          <span>{ds.problems.length}問収録</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="p-4 bg-[#FDF6E2] border-t border-stone-300 flex justify-center">
                <button
                  onClick={() => {
                    if (savedDataSets.length > 0) {
                      const randomDatasetIndex = Math.floor(Math.random() * savedDataSets.length);
                      loadDataSetFromStartup(savedDataSets[randomDatasetIndex]);
                    } else {
                      setShowStartupModal(false);
                      setCurrentProblemIndex(0);
                    }
                  }}
                  className="px-6 py-2 bg-white border border-stone-400 text-stone-800 font-bold rounded-lg hover:bg-stone-200 transition-colors shadow-sm"
                >
                  ランダムで選択
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Answer Image Modal */}
      <AnimatePresence>
        {showAnswerModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-3 sm:p-4 backdrop-blur-sm"
            onClick={() => setShowAnswerModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-4 border-b border-stone-200 flex justify-between items-center bg-stone-50">
                <div className="flex items-center gap-2">
                  <Image className="w-5 h-5 text-emerald-700" />
                  <h3 className="font-bold text-stone-800 text-base sm:text-lg">
                    {currentProblem?.title} - 解答画像
                  </h3>
                </div>
                <button
                  onClick={() => setShowAnswerModal(false)}
                  className="p-1.5 bg-stone-200 rounded-full text-stone-800 hover:bg-stone-300 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-4 overflow-y-auto flex-1 flex flex-col items-center justify-center bg-stone-100 min-h-[250px]">
                {currentProblem?.answerImageUrl ? (
                  <div className="relative w-full flex flex-col items-center gap-3">
                    <img
                      src={currentProblem.answerImageUrl}
                      alt={`${currentProblem.title}の解答画像`}
                      className="max-w-full max-h-[65vh] object-contain rounded-lg shadow-md border border-stone-300 bg-white"
                    />
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-4 text-center p-6 bg-white rounded-xl border border-stone-300 shadow-sm max-w-md w-full">
                    <FileImage className="w-16 h-16 text-stone-400" />
                    <div>
                      <p className="font-bold text-stone-800 text-base sm:text-lg mb-1">
                        解答画像が未登録です
                      </p>
                      <p className="text-xs sm:text-sm text-stone-600">
                        この問題の解答（スクリーンショット）画像を登録すると、ここでいつでも確認できます。
                      </p>
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      ref={answerFileInputRef}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleAnswerImageUpload(file);
                        if (e.target) e.target.value = '';
                      }}
                    />
                    <button
                      onClick={() => answerFileInputRef.current?.click()}
                      className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-5 py-2.5 rounded-xl transition-colors shadow-sm cursor-pointer"
                    >
                      <Upload size={18} />
                      解答画像を登録する
                    </button>
                  </div>
                )}
              </div>

              <div className="p-3 sm:p-4 bg-stone-50 border-t border-stone-200 flex flex-wrap items-center justify-between gap-2">
                {currentProblem?.answerImageUrl ? (
                  <div className="flex gap-2">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      ref={answerFileInputRef}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleAnswerImageUpload(file);
                        if (e.target) e.target.value = '';
                      }}
                    />
                    <button
                      onClick={() => answerFileInputRef.current?.click()}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-200 hover:bg-stone-300 text-stone-800 rounded-lg text-xs sm:text-sm font-bold transition-colors"
                    >
                      <Upload size={16} />
                      画像を変更
                    </button>
                    <button
                      onClick={handleDeleteAnswerImage}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-xs sm:text-sm font-bold transition-colors"
                    >
                      <Trash2 size={16} />
                      削除
                    </button>
                  </div>
                ) : (
                  <div></div>
                )}
                <button
                  onClick={() => setShowAnswerModal(false)}
                  className="px-5 py-2 bg-stone-800 hover:bg-stone-900 text-white rounded-lg font-bold text-xs sm:text-sm transition-colors ml-auto"
                >
                  閉じる
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Registered Solution Modal */}
      <AnimatePresence>
        {showSolutionModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
            onClick={() => setShowSolutionModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl p-5 sm:p-6 max-w-md w-full shadow-2xl flex flex-col gap-4 max-h-[85vh] overflow-hidden border border-stone-200"
            >
              <div className="flex justify-between items-center border-b border-stone-200 pb-3">
                <h3 className="text-base sm:text-lg font-bold text-stone-800 truncate pr-2">
                  登録済み解答手順（{currentProblem?.title || `問題${currentProblemIndex + 1}`}）
                </h3>
                <button
                  onClick={() => setShowSolutionModal(false)}
                  className="p-1.5 bg-stone-100 rounded-full text-stone-600 hover:bg-stone-200 transition-colors shrink-0"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="overflow-y-auto flex-1 p-2 bg-stone-50 rounded-xl border border-stone-200">
                {currentProblem?.solution && currentProblem.solution.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    {formatMovesToJapanese(currentProblem.solution, currentProblem.initialSfen).map((moveStr, idx) => (
                      <div key={idx} className="flex items-center gap-3 px-3 py-2 bg-white rounded-lg border border-stone-200 text-sm font-bold text-stone-800 shadow-sm">
                        <span className="w-12 text-xs text-stone-500 font-mono shrink-0">{idx + 1}手目</span>
                        <span className="text-sm sm:text-base text-stone-900 font-bold">{moveStr}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-stone-500 text-sm text-center py-6">解答手順は登録されていません。</p>
                )}
              </div>

              <div className="flex flex-col gap-2 pt-2 border-t border-stone-200">
                {moveHistory.length > 0 && (
                  <button
                    onClick={() => {
                      setConfirmDialog({
                        message: `現在の局面・指し手（${moveHistory.length}手）で解答手順を上書き登録しますか？`,
                        onConfirm: async () => {
                          const updated = [...problems];
                          updated[currentProblemIndex] = {
                            ...currentProblem,
                            solution: moveHistory
                          };
                          await saveProblemsData(updated);
                          setShowSolutionModal(false);
                          setAlertDialog('解答手順を更新しました。');
                        }
                      });
                    }}
                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm transition-colors shadow-sm"
                  >
                    現在の指し手（{moveHistory.length}手）で上書き登録
                  </button>
                )}
                <button
                  onClick={() => {
                    setConfirmDialog({
                      message: 'この問題の登録済み解答手順を削除しますか？',
                      onConfirm: async () => {
                        const updated = [...problems];
                        const newProb = { ...currentProblem };
                        delete newProb.solution;
                        updated[currentProblemIndex] = newProb;
                        await saveProblemsData(updated);
                        setShowSolutionModal(false);
                        setAlertDialog('登録手順を削除しました。');
                      }
                    });
                  }}
                  className="w-full py-2 bg-red-50 hover:bg-red-100 text-red-600 font-bold rounded-xl text-sm transition-colors border border-red-200"
                >
                  解答手順を削除
                </button>
                <button
                  onClick={() => setShowSolutionModal(false)}
                  className="w-full py-2 bg-stone-200 hover:bg-stone-300 text-stone-800 font-bold rounded-xl text-sm transition-colors"
                >
                  閉じる
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Alert Dialog Modal */}
      <AnimatePresence>
        {alertDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
            onClick={() => setAlertDialog(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl flex flex-col items-center gap-4 text-center border border-stone-200"
            >
              <Info className="w-10 h-10 text-emerald-700" />
              <p className="text-stone-800 font-bold whitespace-pre-wrap leading-relaxed text-sm sm:text-base">
                {alertDialog}
              </p>
              <button
                onClick={() => setAlertDialog(null)}
                className="w-full py-2.5 bg-stone-800 hover:bg-stone-900 text-white rounded-xl font-bold text-sm transition-colors shadow-sm"
              >
                OK
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirm Dialog Modal */}
      <AnimatePresence>
        {confirmDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
            onClick={() => setConfirmDialog(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl flex flex-col items-center gap-4 text-center border border-stone-200"
            >
              <AlertCircle className="w-10 h-10 text-amber-600" />
              <p className="text-stone-800 font-bold whitespace-pre-wrap leading-relaxed text-sm sm:text-base">
                {confirmDialog.message}
              </p>
              <div className="flex gap-3 w-full mt-2">
                <button
                  onClick={() => setConfirmDialog(null)}
                  className="flex-1 py-2.5 bg-stone-200 hover:bg-stone-300 text-stone-800 rounded-xl font-bold text-sm transition-colors"
                >
                  キャンセル
                </button>
                <button
                  onClick={() => {
                    const action = confirmDialog.onConfirm;
                    setConfirmDialog(null);
                    action();
                  }}
                  className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-sm transition-colors shadow-sm"
                >
                  実行する
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
