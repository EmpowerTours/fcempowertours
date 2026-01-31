'use client';

import React from 'react';
import { CheckCircle2, XCircle, Circle } from 'lucide-react';

export type StepStatus = 'completed' | 'active' | 'failed' | 'pending';

export interface PipelineStep {
  label: string;
  status: StepStatus;
  detail?: string;
}

interface PipelineTrackerProps {
  steps: PipelineStep[];
  isDarkMode?: boolean;
  compact?: boolean;
}

export const PipelineTracker: React.FC<PipelineTrackerProps> = ({
  steps,
  isDarkMode = true,
  compact = false,
}) => {
  const getStepIcon = (status: StepStatus) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className={`${compact ? 'w-4 h-4' : 'w-5 h-5'} text-green-400`} />;
      case 'active':
        return (
          <div className={`${compact ? 'w-4 h-4' : 'w-5 h-5'} rounded-full border-2 border-cyan-400 flex items-center justify-center`}>
            <div className={`${compact ? 'w-1.5 h-1.5' : 'w-2 h-2'} rounded-full bg-cyan-400 animate-pulse`} />
          </div>
        );
      case 'failed':
        return <XCircle className={`${compact ? 'w-4 h-4' : 'w-5 h-5'} text-red-400`} />;
      default:
        return <Circle className={`${compact ? 'w-4 h-4' : 'w-5 h-5'} text-gray-600`} />;
    }
  };

  const getLineColor = (currentStatus: StepStatus, nextStatus: StepStatus) => {
    if (currentStatus === 'completed') return 'bg-green-400';
    if (currentStatus === 'active') return 'bg-cyan-400/30';
    if (currentStatus === 'failed') return 'bg-red-400/30';
    return isDarkMode ? 'bg-gray-700' : 'bg-gray-300';
  };

  if (compact) {
    return (
      <div className="flex items-center gap-1">
        {steps.map((step, i) => (
          <React.Fragment key={step.label}>
            <div className={`w-2 h-2 rounded-full ${
              step.status === 'completed' ? 'bg-green-400' :
              step.status === 'active' ? 'bg-cyan-400 animate-pulse' :
              step.status === 'failed' ? 'bg-red-400' :
              'bg-gray-600'
            }`} title={step.label} />
            {i < steps.length - 1 && (
              <div className={`w-3 h-0.5 ${
                step.status === 'completed' ? 'bg-green-400' :
                step.status === 'active' ? 'bg-cyan-400/30' :
                'bg-gray-700'
              }`} />
            )}
          </React.Fragment>
        ))}
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Step indicators */}
      <div className="flex items-center justify-between">
        {steps.map((step, i) => (
          <React.Fragment key={step.label}>
            <div className="flex flex-col items-center">
              {getStepIcon(step.status)}
              <span className={`mt-1 text-[10px] font-medium ${
                step.status === 'completed' ? 'text-green-400' :
                step.status === 'active' ? 'text-cyan-400' :
                step.status === 'failed' ? 'text-red-400' :
                'text-gray-500'
              }`}>
                {step.label}
              </span>
              {step.detail && (
                <span className="text-[9px] text-gray-500 mt-0.5">{step.detail}</span>
              )}
            </div>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-0.5 mx-1 ${getLineColor(step.status, steps[i + 1].status)}`} />
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};
