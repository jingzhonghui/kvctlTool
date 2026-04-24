#ifndef TEXTEDIT_H
#define TEXTEDIT_H

#include <QWidget>
#include <QTextEdit>
#include <QAction>

class TextEdit : public QTextEdit
{
    Q_OBJECT
public:
    explicit TextEdit(QWidget *parent = nullptr);
    virtual ~TextEdit();

private:
    void ConnectAll();
private:
    QAction *m_cleanAction = nullptr;
};

#endif // TEXTEDIT_H
