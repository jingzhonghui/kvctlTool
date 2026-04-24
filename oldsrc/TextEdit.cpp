#include "TextEdit.h"

TextEdit::TextEdit(QWidget *parent) : QTextEdit(parent)
{
    m_cleanAction = new QAction("清空",this);
    this->addAction(m_cleanAction);

    this->setContextMenuPolicy(Qt::ActionsContextMenu);
    ConnectAll();
}
TextEdit::~TextEdit()
{

}


void TextEdit::ConnectAll()
{
    connect(m_cleanAction,&QAction::triggered,this,[this](){
        this->clear();
    });
}
