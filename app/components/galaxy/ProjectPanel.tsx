'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ExternalLink, Check, Coins, ArrowRight } from 'lucide-react';
import { Project, Task, TOURS_REWARD_PER_TASK } from '@/lib/galaxy/projects';

interface ProjectPanelProps {
  project: Project | null;
  onClose: () => void;
  completedTasks: string[];
  onTaskComplete: (taskId: string, inAppRoute?: string) => void;
  isCompletingTask: boolean;
  userToursBalance?: number;
}

export function ProjectPanel({
  project,
  onClose,
  completedTasks,
  onTaskComplete,
  isCompletingTask,
  userToursBalance = 0,
}: ProjectPanelProps) {
  const [expandedTask, setExpandedTask] = useState<string | null>(null);

  if (!project) return null;

  const totalTasks = project.tasks.length;
  const completedCount = completedTasks.length;
  const progress = totalTasks > 0 ? (completedCount / totalTasks) * 100 : 0;
  const earnedTours = completedCount * TOURS_REWARD_PER_TASK;
  const remainingTours = (totalTasks - completedCount) * TOURS_REWARD_PER_TASK;

  const handleTaskClick = (task: Task) => {
    if (completedTasks.includes(task.id)) return;

    if (task.url) {
      // External link - open in new tab
      window.open(task.url, '_blank');
    }

    // Mark as completed (or navigate in-app)
    onTaskComplete(task.id, task.inAppRoute);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, x: 300 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 300 }}
        className="fixed right-0 top-0 h-full w-full sm:w-96 z-50 overflow-y-auto"
        style={{
          background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
          borderLeft: `2px solid ${project.color}`,
          boxShadow: `-4px 0 20px rgba(0, 0, 0, 0.5)`,
        }}
      >
        {/* Header */}
        <div
          className="sticky top-0 p-4 border-b"
          style={{
            background: 'rgba(26, 26, 46, 0.95)',
            borderColor: `${project.color}40`,
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              {project.logo && (
                <img
                  src={project.logo}
                  alt={project.name}
                  className="w-10 h-10 rounded-full"
                  style={{ border: `2px solid ${project.color}` }}
                />
              )}
              <div>
                <h2
                  className="text-xl font-bold"
                  style={{ color: '#ffffff', background: 'transparent' }}
                >
                  {project.name}
                </h2>
                <span
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{
                    background: `${project.color}30`,
                    color: project.color,
                  }}
                >
                  {project.category}
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-white/10 transition-colors"
              style={{ background: 'transparent' }}
            >
              <X size={20} style={{ color: '#ffffff' }} />
            </button>
          </div>

          <p
            className="text-sm mb-4"
            style={{ color: '#a0a0a0', background: 'transparent' }}
          >
            {project.description}
          </p>

          {/* Progress bar */}
          <div className="mb-2">
            <div className="flex justify-between text-xs mb-1">
              <span style={{ color: '#a0a0a0', background: 'transparent' }}>
                Progress: {completedCount}/{totalTasks} tasks
              </span>
              <span style={{ color: '#22c55e', background: 'transparent' }}>
                {progress.toFixed(0)}%
              </span>
            </div>
            <div
              className="h-2 rounded-full overflow-hidden"
              style={{ background: 'rgba(255, 255, 255, 0.1)' }}
            >
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                className="h-full rounded-full"
                style={{
                  background: `linear-gradient(90deg, ${project.color}, #22c55e)`,
                }}
              />
            </div>
          </div>

          {/* TOURS earned */}
          <div
            className="flex items-center justify-between p-2 rounded-lg"
            style={{ background: 'rgba(124, 58, 237, 0.2)' }}
          >
            <div className="flex items-center gap-2">
              <Coins size={16} style={{ color: '#a855f7' }} />
              <span
                className="text-sm font-medium"
                style={{ color: '#ffffff', background: 'transparent' }}
              >
                Earned: {earnedTours} TOURS
              </span>
            </div>
            {remainingTours > 0 && (
              <span
                className="text-xs"
                style={{ color: '#a0a0a0', background: 'transparent' }}
              >
                +{remainingTours} available
              </span>
            )}
          </div>
        </div>

        {/* Tasks */}
        <div className="p-4 space-y-3">
          <h3
            className="text-sm font-semibold mb-3"
            style={{ color: '#ffffff', background: 'transparent' }}
          >
            Engagement Tasks
          </h3>

          {project.tasks.map((task, index) => {
            const isCompleted = completedTasks.includes(task.id);
            const isExpanded = expandedTask === task.id;

            return (
              <motion.div
                key={task.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="rounded-xl overflow-hidden"
                style={{
                  background: isCompleted
                    ? 'rgba(34, 197, 94, 0.1)'
                    : 'rgba(255, 255, 255, 0.05)',
                  border: `1px solid ${
                    isCompleted ? '#22c55e40' : 'rgba(255, 255, 255, 0.1)'
                  }`,
                }}
              >
                <button
                  onClick={() => setExpandedTask(isExpanded ? null : task.id)}
                  className="w-full p-3 flex items-center justify-between"
                  style={{ background: 'transparent' }}
                  disabled={isCompletingTask}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center"
                      style={{
                        background: isCompleted ? '#22c55e' : `${project.color}30`,
                      }}
                    >
                      {isCompleted ? (
                        <Check size={16} style={{ color: '#ffffff' }} />
                      ) : (
                        <span
                          className="text-sm font-bold"
                          style={{ color: project.color, background: 'transparent' }}
                        >
                          {index + 1}
                        </span>
                      )}
                    </div>
                    <div className="text-left">
                      <p
                        className="font-medium text-sm"
                        style={{
                          color: isCompleted ? '#22c55e' : '#ffffff',
                          background: 'transparent',
                        }}
                      >
                        {task.title}
                      </p>
                      <div className="flex items-center gap-2">
                        <span
                          className="text-xs"
                          style={{ color: '#a855f7', background: 'transparent' }}
                        >
                          +{task.toursReward} TOURS
                        </span>
                        {task.inAppRoute && (
                          <span
                            className="text-xs px-1.5 py-0.5 rounded"
                            style={{
                              background: 'rgba(34, 197, 94, 0.2)',
                              color: '#22c55e',
                            }}
                          >
                            In-App
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <ArrowRight
                    size={16}
                    style={{
                      color: '#a0a0a0',
                      transform: isExpanded ? 'rotate(90deg)' : 'none',
                      transition: 'transform 0.2s',
                    }}
                  />
                </button>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="px-3 pb-3"
                    >
                      <p
                        className="text-sm mb-3"
                        style={{ color: '#a0a0a0', background: 'transparent' }}
                      >
                        {task.description}
                      </p>

                      {!isCompleted && (
                        <button
                          onClick={() => handleTaskClick(task)}
                          disabled={isCompletingTask}
                          className="w-full py-2 px-4 rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-all hover:opacity-90 disabled:opacity-50"
                          style={{
                            background: project.color,
                            color: '#ffffff',
                          }}
                        >
                          {isCompletingTask ? (
                            'Processing...'
                          ) : task.inAppRoute ? (
                            <>
                              Open Feature <ArrowRight size={14} />
                            </>
                          ) : (
                            <>
                              Complete Task <ExternalLink size={14} />
                            </>
                          )}
                        </button>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>

        {/* External links */}
        {(project.website || project.twitter || project.farcasterUrl) && (
          <div
            className="p-4 border-t"
            style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}
          >
            <h3
              className="text-sm font-semibold mb-3"
              style={{ color: '#ffffff', background: 'transparent' }}
            >
              Links
            </h3>
            <div className="flex flex-wrap gap-2">
              {project.website && (
                <a
                  href={project.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-lg text-xs flex items-center gap-1 hover:opacity-80 transition-opacity"
                  style={{
                    background: 'rgba(255, 255, 255, 0.1)',
                    color: '#ffffff',
                  }}
                >
                  Website <ExternalLink size={12} />
                </a>
              )}
              {project.twitter && (
                <a
                  href={project.twitter}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-lg text-xs flex items-center gap-1 hover:opacity-80 transition-opacity"
                  style={{
                    background: 'rgba(29, 155, 240, 0.2)',
                    color: '#1d9bf0',
                  }}
                >
                  Twitter <ExternalLink size={12} />
                </a>
              )}
              {project.farcasterUrl && (
                <a
                  href={project.farcasterUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-lg text-xs flex items-center gap-1 hover:opacity-80 transition-opacity"
                  style={{
                    background: 'rgba(131, 110, 249, 0.2)',
                    color: '#836ef9',
                  }}
                >
                  Farcaster <ExternalLink size={12} />
                </a>
              )}
            </div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
