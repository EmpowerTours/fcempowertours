'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Coins, Trophy, Rocket, HelpCircle, X } from 'lucide-react';
import { GalaxyScene } from './GalaxyScene';
import { ProjectPanel } from './ProjectPanel';
import { Project, monadProjects, TOURS_REWARD_PER_TASK, getAllTasks } from '@/lib/galaxy/projects';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';
import { toast } from 'sonner';

const STORAGE_KEY = 'galaxy_completed_tasks';

interface GalaxyStats {
  totalEarned: number;
  tasksCompleted: number;
  projectsExplored: number;
}

export function GalaxyClient() {
  const router = useRouter();
  const { walletAddress, fid } = useFarcasterContext();

  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [completedTasks, setCompletedTasks] = useState<Record<string, string[]>>({});
  const [isCompletingTask, setIsCompletingTask] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [stats, setStats] = useState<GalaxyStats>({
    totalEarned: 0,
    tasksCompleted: 0,
    projectsExplored: 0,
  });

  // Load completed tasks from localStorage and sync with server
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setCompletedTasks(parsed);
      } catch (e) {
        console.error('Failed to parse stored tasks:', e);
      }
    }

    // Show tutorial on first visit
    const tutorialShown = localStorage.getItem('galaxy_tutorial_shown');
    if (!tutorialShown) {
      setShowTutorial(true);
    }
  }, []);

  // Sync completed tasks from server when wallet is connected
  useEffect(() => {
    if (!walletAddress) return;

    const fetchServerTasks = async () => {
      try {
        const response = await fetch(`/api/galaxy/complete-task?wallet=${walletAddress}`);
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.data.completedTasks) {
            // Merge server tasks with local tasks
            setCompletedTasks((prev) => {
              const merged = { ...prev };
              Object.entries(data.data.completedTasks as Record<string, string[]>).forEach(
                ([projectId, taskIds]) => {
                  if (!merged[projectId]) {
                    merged[projectId] = [];
                  }
                  taskIds.forEach((taskId) => {
                    if (!merged[projectId].includes(taskId)) {
                      merged[projectId].push(taskId);
                    }
                  });
                }
              );
              localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
              return merged;
            });
          }
        }
      } catch (error) {
        console.error('Failed to fetch server tasks:', error);
      }
    };

    fetchServerTasks();
  }, [walletAddress]);

  // Calculate stats whenever completed tasks change
  useEffect(() => {
    let totalCompleted = 0;
    let projectsWithProgress = 0;

    Object.entries(completedTasks).forEach(([projectId, taskIds]) => {
      totalCompleted += taskIds.length;
      if (taskIds.length > 0) {
        projectsWithProgress++;
      }
    });

    setStats({
      totalEarned: totalCompleted * TOURS_REWARD_PER_TASK,
      tasksCompleted: totalCompleted,
      projectsExplored: projectsWithProgress,
    });
  }, [completedTasks]);

  // Save completed tasks to localStorage
  const saveCompletedTasks = useCallback((tasks: Record<string, string[]>) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  }, []);

  // Handle planet click
  const handlePlanetClick = useCallback((project: Project) => {
    setSelectedProject(project);
  }, []);

  // Handle task completion
  const handleTaskComplete = useCallback(
    async (taskId: string, inAppRoute?: string) => {
      if (!selectedProject || !walletAddress) {
        toast.error('Please connect your wallet first');
        return;
      }

      const task = selectedProject.tasks.find((t) => t.id === taskId);
      if (!task) return;

      // Check if already completed
      const projectTasks = completedTasks[selectedProject.id] || [];
      if (projectTasks.includes(taskId)) {
        toast.info('Task already completed!');
        return;
      }

      setIsCompletingTask(true);

      try {
        // Call API to record task completion and award TOURS
        const response = await fetch('/api/galaxy/complete-task', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            projectId: selectedProject.id,
            taskId: task.id,
            walletAddress,
            fid,
            toursReward: task.toursReward,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to complete task');
        }

        // Update local state
        const newCompletedTasks = {
          ...completedTasks,
          [selectedProject.id]: [...projectTasks, taskId],
        };
        setCompletedTasks(newCompletedTasks);
        saveCompletedTasks(newCompletedTasks);

        // Show success toast
        toast.success(
          <div className="flex items-center gap-2">
            <Coins size={16} className="text-purple-500" />
            <span>+{task.toursReward} TOURS earned!</span>
          </div>
        );

        // If it's an in-app route (EmpowerTours), navigate after a short delay
        if (inAppRoute && selectedProject.isEmpowerTours) {
          setTimeout(() => {
            setSelectedProject(null);
            router.push(inAppRoute);
          }, 1000);
        }
      } catch (error) {
        console.error('Failed to complete task:', error);
        toast.error(error instanceof Error ? error.message : 'Failed to complete task');
      } finally {
        setIsCompletingTask(false);
      }
    },
    [selectedProject, completedTasks, walletAddress, fid, router, saveCompletedTasks]
  );

  // Close tutorial
  const closeTutorial = () => {
    setShowTutorial(false);
    localStorage.setItem('galaxy_tutorial_shown', 'true');
  };

  const totalPossibleTasks = getAllTasks().length;
  const progressPercentage = (stats.tasksCompleted / totalPossibleTasks) * 100;

  return (
    <div className="relative w-full h-screen overflow-hidden" style={{ background: '#0a0a1a' }}>
      {/* 3D Galaxy Scene */}
      <GalaxyScene
        onPlanetClick={handlePlanetClick}
        selectedProject={selectedProject}
        completedTasks={completedTasks}
      />

      {/* Top Stats Bar */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="absolute top-4 left-4 right-4 flex items-center justify-between z-10"
      >
        <div className="flex items-center gap-4">
          {/* TOURS Balance */}
          <div
            className="flex items-center gap-2 px-4 py-2 rounded-full"
            style={{
              background: 'rgba(131, 110, 249, 0.2)',
              border: '1px solid rgba(131, 110, 249, 0.4)',
            }}
          >
            <Coins size={18} style={{ color: '#a855f7' }} />
            <span
              className="font-bold"
              style={{ color: '#ffffff', background: 'transparent' }}
            >
              {stats.totalEarned} TOURS
            </span>
          </div>

          {/* Tasks Progress */}
          <div
            className="flex items-center gap-2 px-4 py-2 rounded-full"
            style={{
              background: 'rgba(34, 197, 94, 0.2)',
              border: '1px solid rgba(34, 197, 94, 0.4)',
            }}
          >
            <Trophy size={18} style={{ color: '#22c55e' }} />
            <span
              className="font-medium"
              style={{ color: '#ffffff', background: 'transparent' }}
            >
              {stats.tasksCompleted}/{totalPossibleTasks}
            </span>
          </div>
        </div>

        {/* Help button */}
        <button
          onClick={() => setShowTutorial(true)}
          className="p-2 rounded-full transition-colors hover:bg-white/10"
          style={{ background: 'rgba(255, 255, 255, 0.1)' }}
        >
          <HelpCircle size={20} style={{ color: '#ffffff' }} />
        </button>
      </motion.div>

      {/* Bottom Progress Bar */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="absolute bottom-4 left-4 right-4 z-10"
      >
        <div
          className="p-3 rounded-xl"
          style={{
            background: 'rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(10px)',
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <span
              className="text-sm font-medium"
              style={{ color: '#a0a0a0', background: 'transparent' }}
            >
              Galaxy Exploration Progress
            </span>
            <span
              className="text-sm font-bold"
              style={{ color: '#22c55e', background: 'transparent' }}
            >
              {progressPercentage.toFixed(1)}%
            </span>
          </div>
          <div
            className="h-2 rounded-full overflow-hidden"
            style={{ background: 'rgba(255, 255, 255, 0.1)' }}
          >
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progressPercentage}%` }}
              transition={{ duration: 1, ease: 'easeOut' }}
              className="h-full rounded-full"
              style={{
                background: 'linear-gradient(90deg, #836EF9, #22c55e)',
              }}
            />
          </div>
          <div
            className="flex items-center justify-between mt-2 text-xs"
            style={{ color: '#6b7280', background: 'transparent' }}
          >
            <span style={{ background: 'transparent' }}>
              {stats.projectsExplored}/{monadProjects.length} projects explored
            </span>
            <span style={{ background: 'transparent' }}>
              {(totalPossibleTasks - stats.tasksCompleted) * TOURS_REWARD_PER_TASK} TOURS remaining
            </span>
          </div>
        </div>
      </motion.div>

      {/* Project Panel (Slide-in) */}
      {selectedProject && (
        <ProjectPanel
          project={selectedProject}
          onClose={() => setSelectedProject(null)}
          completedTasks={completedTasks[selectedProject.id] || []}
          onTaskComplete={handleTaskComplete}
          isCompletingTask={isCompletingTask}
        />
      )}

      {/* Tutorial Overlay */}
      {showTutorial && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0, 0, 0, 0.8)' }}
          onClick={closeTutorial}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="max-w-md p-6 rounded-2xl"
            style={{
              background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
              border: '1px solid rgba(131, 110, 249, 0.4)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Rocket size={28} style={{ color: '#836EF9' }} />
                <h2
                  className="text-xl font-bold"
                  style={{ color: '#ffffff', background: 'transparent' }}
                >
                  Welcome to the Galaxy!
                </h2>
              </div>
              <button
                onClick={closeTutorial}
                className="p-1 rounded-full hover:bg-white/10"
                style={{ background: 'transparent' }}
              >
                <X size={20} style={{ color: '#a0a0a0' }} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(131, 110, 249, 0.3)' }}
                >
                  <span style={{ color: '#836EF9', background: 'transparent' }}>1</span>
                </div>
                <p style={{ color: '#a0a0a0', background: 'transparent' }}>
                  <strong style={{ color: '#ffffff', background: 'transparent' }}>
                    Explore the Galaxy
                  </strong>
                  <br />
                  Drag to rotate, scroll to zoom. Each planet is a Monad ecosystem project.
                </p>
              </div>

              <div className="flex items-start gap-3">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(131, 110, 249, 0.3)' }}
                >
                  <span style={{ color: '#836EF9', background: 'transparent' }}>2</span>
                </div>
                <p style={{ color: '#a0a0a0', background: 'transparent' }}>
                  <strong style={{ color: '#ffffff', background: 'transparent' }}>
                    Complete Tasks
                  </strong>
                  <br />
                  Click on planets to view engagement tasks. Complete them to earn TOURS!
                </p>
              </div>

              <div className="flex items-start gap-3">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(34, 197, 94, 0.3)' }}
                >
                  <span style={{ color: '#22c55e', background: 'transparent' }}>3</span>
                </div>
                <p style={{ color: '#a0a0a0', background: 'transparent' }}>
                  <strong style={{ color: '#ffffff', background: 'transparent' }}>
                    EmpowerTours Planet
                  </strong>
                  <br />
                  Find the purple EmpowerTours planet! Tasks there open features right inside the
                  app.
                </p>
              </div>

              <div className="flex items-start gap-3">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(255, 215, 0, 0.3)' }}
                >
                  <Coins size={16} style={{ color: '#FFD700' }} />
                </div>
                <p style={{ color: '#a0a0a0', background: 'transparent' }}>
                  <strong style={{ color: '#ffffff', background: 'transparent' }}>
                    Earn {TOURS_REWARD_PER_TASK} TOURS per task
                  </strong>
                  <br />
                  Use TOURS for minting NFTs, swapping tokens, and more!
                </p>
              </div>
            </div>

            <button
              onClick={closeTutorial}
              className="w-full mt-6 py-3 rounded-xl font-bold transition-opacity hover:opacity-90"
              style={{ background: '#836EF9', color: '#ffffff' }}
            >
              Start Exploring
            </button>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
