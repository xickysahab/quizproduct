import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { Parser } from 'json2csv';

export const getQuestionAnalytics = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const questionId = req.params.id as string;
    
    const question = await prisma.question.findUnique({
      where: { id: questionId },
      include: {
        event: true,
        responses: true
      }
    });

    if (!question || question.event.hostId !== req.user?.userId) {
      res.status(403).json({ message: 'Forbidden or not found' });
      return;
    }

    const totalResponses = question.responses.length;
    const optionCounts = Array(question.options.length).fill(0);
    
    question.responses.forEach(response => {
      if (response.selectedOption >= 0 && response.selectedOption < optionCounts.length) {
        optionCounts[response.selectedOption] = (optionCounts[response.selectedOption] || 0) + 1;
      }
    });

    const percentages = optionCounts.map(count => 
      totalResponses === 0 ? 0 : Math.round((count / totalResponses) * 100)
    );

    res.status(200).json({
      totalResponses,
      optionCounts,
      percentages
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const exportEventAnalytics = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const eventId = req.params.id as string;

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        questions: {
          orderBy: { order: 'asc' }
        },
        participants: {
          include: {
            responses: true
          }
        }
      }
    });

    if (!event || event.hostId !== req.user?.userId) {
      res.status(403).json({ message: 'Forbidden or not found' });
      return;
    }

    // Format data for CSV
    const csvData = event.participants.map(p => {
      const row: any = {
        ParticipantName: p.name,
        JoinedAt: p.joinedAt.toISOString(),
        TotalScore: p.responses.filter(r => r.isCorrect).length
      };

      event.questions.forEach((q, index) => {
        const response = p.responses.find(r => r.questionId === q.id);
        row[`Q${index + 1} (${q.text})`] = response ? q.options[response.selectedOption] : 'No Answer';
      });

      return row;
    });

    if (csvData.length === 0) {
      res.status(400).json({ message: 'No participants data to export' });
      return;
    }

    const parser = new Parser();
    const csv = parser.parse(csvData);

    res.header('Content-Type', 'text/csv');
    res.attachment(`${event.title.replace(/\s+/g, '_')}_Analytics.csv`);
    res.send(csv);

  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getEventSummaryAnalytics = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const eventId = req.params.id as string;
    
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        questions: {
          orderBy: { order: 'asc' },
          include: { responses: true }
        }
      }
    });

    if (!event || event.hostId !== req.user?.userId) {
      res.status(403).json({ message: 'Forbidden or not found' });
      return;
    }

    let collectiveTotalResponses = 0;
    const collectiveOptionCounts = [0, 0, 0, 0]; // Assume max 4 options for aggregation
    const sumOfPercentages = [0, 0, 0, 0];
    let questionsWithResponses = 0;

    const summary = event.questions.map(question => {
      const totalResponses = question.responses.length;
      const optionCounts = Array(question.options.length).fill(0);
      
      question.responses.forEach(response => {
        if (response.selectedOption >= 0 && response.selectedOption < optionCounts.length) {
          optionCounts[response.selectedOption] = (optionCounts[response.selectedOption] || 0) + 1;
        }
        if (response.selectedOption >= 0 && response.selectedOption < 4) {
          collectiveOptionCounts[response.selectedOption] = (collectiveOptionCounts[response.selectedOption] || 0) + 1;
          collectiveTotalResponses++;
        }
      });

      const percentages = optionCounts.map(count => 
        totalResponses === 0 ? 0 : Math.round((count / totalResponses) * 100)
      );

      if (totalResponses > 0) {
        questionsWithResponses++;
        for (let i = 0; i < percentages.length; i++) {
          const prevSum = sumOfPercentages[i];
          const currPct = percentages[i];
          if (i < 4 && prevSum !== undefined && currPct !== undefined) {
            sumOfPercentages[i] = prevSum + currPct;
          }
        }
      }

      return {
        id: question.id,
        text: question.text,
        options: question.options,
        correctOption: question.correctOption,
        totalResponses,
        optionCounts,
        percentages
      };
    });

    // Calculate the mean percentage for each option across all questions
    let collectivePercentages = sumOfPercentages.map(sum => 
      questionsWithResponses === 0 ? 0 : Math.round(sum / questionsWithResponses)
    );

    // Normalize so they always sum exactly to 100% (or 0% if no responses)
    const totalMeanPercentage = collectivePercentages.reduce((a, b) => a + b, 0);
    if (totalMeanPercentage > 0 && totalMeanPercentage !== 100) {
      // Find the max percentage and adjust it to make the sum 100%
      const maxIdx = collectivePercentages.indexOf(Math.max(...collectivePercentages));
      const diff = 100 - totalMeanPercentage;
      if (maxIdx !== -1 && collectivePercentages[maxIdx] !== undefined) {
        collectivePercentages[maxIdx] += diff;
      }
    }

    res.status(200).json({
      eventId: event.id,
      title: event.title,
      totalParticipants: await prisma.participant.count({ where: { eventId } }),
      questions: summary,
      collective: {
        totalResponses: collectiveTotalResponses,
        optionCounts: collectiveOptionCounts,
        percentages: collectivePercentages,
        // Take the options text from the first question assuming they are uniform for a survey
        optionsText: event.questions.length > 0 ? event.questions[0]!.options : ['A', 'B', 'C', 'D']
      }
    });

  } catch (error) {
    console.error('Summary analytics error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
